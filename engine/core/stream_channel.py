"""
Stream Channel — Chunked Data Pipeline Between Nodes
=====================================================

Enables producer nodes to `yield` DataFrames in chunks that are
immediately available to downstream consumers via async queues
backed by Arrow RecordBatches.

Architecture:
    Producer Node → yield DataFrame chunk
        → convert to Arrow RecordBatch
        → StreamChannel.write_batch()
        → asyncio.Queue
    Consumer Node → stream_input("var_name")
        → StreamChannel.read_batches()  (async iterator)
        → process each chunk immediately

This reduces peak RAM from full-dataset to ~1 chunk (~10K rows).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

log = logging.getLogger(__name__)

# Try importing Arrow
try:
    import pyarrow as pa
    ARROW_AVAILABLE = True
except ImportError:
    ARROW_AVAILABLE = False

# Try importing pandas
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


# Sentinel to signal end-of-stream
_END_OF_STREAM = object()


def _to_record_batch(data: Any) -> "pa.RecordBatch":
    """
    Convert a DataFrame-like object to an Arrow RecordBatch.
    Supports: pandas DataFrame, Arrow Table, Arrow RecordBatch, dict.
    """
    if not ARROW_AVAILABLE:
        raise RuntimeError("PyArrow required for streaming")

    if isinstance(data, pa.RecordBatch):
        return data

    if isinstance(data, pa.Table):
        # Flatten to single batch
        return data.combine_chunks().to_batches()[0] if data.num_rows > 0 else pa.RecordBatch.from_pydict({})

    if PANDAS_AVAILABLE and isinstance(data, pd.DataFrame):
        table = pa.Table.from_pandas(data, preserve_index=False)
        if table.num_rows > 0:
            return table.combine_chunks().to_batches()[0]
        return pa.RecordBatch.from_pydict({col: [] for col in data.columns})

    if isinstance(data, dict):
        return pa.RecordBatch.from_pydict(data)

    raise TypeError(f"Cannot convert {type(data).__name__} to Arrow RecordBatch")


@dataclass
class StreamStats:
    """Statistics for a stream channel."""
    chunks_written: int = 0
    chunks_read: int = 0
    total_rows_written: int = 0
    total_rows_read: int = 0
    is_closed: bool = False


class StreamChannel:
    """
    An async queue of Arrow RecordBatches between a producer and consumer node.

    The producer calls write_batch() for each chunk, then close().
    The consumer iterates via read_batches() or collects everything with read_all().

    Thread-safe: the queue is an asyncio.Queue bridged for sync producers.
    """

    def __init__(
        self,
        source_node: str,
        target_node: str,
        var_name: str,
        max_buffer: int = 4,
    ):
        self.source_node = source_node
        self.target_node = target_node
        self.var_name = var_name
        self.max_buffer = max_buffer
        self._subscribers: Dict[str, asyncio.Queue] = {}  # subscriber_id -> Queue
        self._closed = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self.stats = StreamStats()

    def subscribe(self, subscriber_id: str) -> asyncio.Queue:
        """Register a new consumer and return its dedicated queue."""
        if self._closed:
            raise RuntimeError("StreamChannel is already closed")
        if subscriber_id not in self._subscribers:
            self._subscribers[subscriber_id] = asyncio.Queue(maxsize=self.max_buffer)
            log.info(f"StreamChannel {self.source_node}: added subscriber {subscriber_id}")
        return self._subscribers[subscriber_id]

    def _get_loop(self) -> asyncio.AbstractEventLoop:
        if self._loop is None:
            self._loop = asyncio.get_event_loop()
        return self._loop

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Set the event loop (call from the async context)."""
        self._loop = loop

    def write_batch(self, data: Any, put_timeout: Optional[float] = None) -> None:
        """
        Write a chunk to the stream (called from producer, possibly sync thread).
        Converts data to Arrow RecordBatch and enqueues it.
        Blocks if the buffer is full (backpressure).

        Args:
            data: DataFrame-like chunk to send downstream.
            put_timeout: Max seconds to wait for a consumer queue slot.
                         Defaults to GARDENIA_STREAM_PUT_TIMEOUT env var or 30s.
                         Set None to use default.
        """
        if self._closed:
            raise RuntimeError("StreamChannel is closed")

        import os
        _timeout = put_timeout if put_timeout is not None else float(
            os.environ.get("GARDENIA_STREAM_PUT_TIMEOUT", "30")
        )

        batch = _to_record_batch(data)
        self.stats.chunks_written += 1
        self.stats.total_rows_written += batch.num_rows

        loop = self._get_loop()

        if not self._subscribers:
            # No consumers registered yet — discard silently
            return

        import concurrent.futures
        futures = []
        for sub_id, sub_queue in self._subscribers.items():
            futures.append((sub_id, asyncio.run_coroutine_threadsafe(
                sub_queue.put(batch), loop
            )))

        for sub_id, f in futures:
            try:
                f.result(timeout=_timeout)
            except concurrent.futures.TimeoutError:
                # Consumer queue full for _timeout seconds → consumer is dead/stuck
                self._closed = True
                raise RuntimeError(
                    f"StreamChannel: subscriber '{sub_id}' queue full for "
                    f"{_timeout:.0f}s — consumer may be dead or too slow. "
                    f"Stopping producer."
                )
            except asyncio.CancelledError:
                self._closed = True
                raise RuntimeError(
                    "StreamChannel queue cancelled (consumer likely exited)"
                )

    def close(self) -> None:
        """Signal end-of-stream (called from producer when done)."""
        if self._closed:
            return
        self._closed = True
        self.stats.is_closed = True
        loop = self._get_loop()
        if self._subscribers:
            futures = []
            for sub_queue in self._subscribers.values():
                futures.append(asyncio.run_coroutine_threadsafe(
                    sub_queue.put(_END_OF_STREAM), loop
                ))
            for f in futures:
                f.result(timeout=10)

    def cancel(self) -> None:
        """Force cancel the stream to unblock producers if consumer dies."""
        self._closed = True
        self.stats.is_closed = True
        if self._subscribers:
            for sub_queue in self._subscribers.values():
                # Drain the queue to unblock any pending put()
                while not sub_queue.empty():
                    try:
                        sub_queue.get_nowait()
                        sub_queue.task_done()
                    except asyncio.QueueEmpty:
                        break
                # Put END OF STREAM just in case
                try:
                    sub_queue.put_nowait(_END_OF_STREAM)
                except asyncio.QueueFull:
                    pass

    async def read_batches(self, subscriber_id: str) -> AsyncIterator["pa.RecordBatch"]:
        """
        Async iterator that yields RecordBatches as they arrive for a specific subscriber.
        """
        queue = self.subscribe(subscriber_id)
        while True:
            item = await queue.get()
            if item is _END_OF_STREAM:
                break
            self.stats.chunks_read += 1
            self.stats.total_rows_read += item.num_rows
            yield item

    async def read_all(self, subscriber_id: str) -> Optional["pa.Table"]:
        """
        Collect all chunks into a single Arrow Table.
        Useful for backward compatibility when the consumer doesn't use streaming.
        """
        batches = []
        async for batch in self.read_batches(subscriber_id):
            batches.append(batch)

        if not batches:
            return None

        return pa.Table.from_batches(batches)

    def read_batches_sync(self, subscriber_id: str):
        """
        Synchronous iterator for consumer nodes running in threads.
        Yields pandas DataFrames (converted from Arrow batches).
        """
        loop = self._get_loop()
        
        # We must register the subscriber synchronously if it hasn't been yet
        # But we must run it in the async loop
        def _get_queue():
            return self.subscribe(subscriber_id)
        
        future = asyncio.run_coroutine_threadsafe(
            asyncio.to_thread(_get_queue), loop
        )
        queue = future.result(timeout=10)

        while True:
            future = asyncio.run_coroutine_threadsafe(
                queue.get(), loop
            )
            item = future.result(timeout=600)  # 10 min max wait per chunk
            if item is _END_OF_STREAM:
                break
            self.stats.chunks_read += 1
            self.stats.total_rows_read += item.num_rows

            # Convert to pandas for user code
            if PANDAS_AVAILABLE:
                yield item.to_pandas()
            else:
                yield item


class StreamRegistry:
    """
    Registry of active stream channels between nodes.
    Keyed by (source_node_id, variable_name).
    """

    def __init__(self):
        self._channels: Dict[Tuple[str, str], StreamChannel] = {}

    def create_channel(
        self,
        source_node: str,
        target_node: str,
        var_name: str = "data",
        max_buffer: int = 4,
    ) -> StreamChannel:
        """Create a new stream channel between two nodes."""
        key = (source_node, var_name)
        channel = StreamChannel(source_node, target_node, var_name, max_buffer)
        self._channels[key] = channel
        log.info(
            f"StreamRegistry: created channel {source_node} → {target_node} "
            f"var='{var_name}' buffer={max_buffer}"
        )
        return channel

    def get_channel(self, source_node: str, var_name: str = "data") -> Optional[StreamChannel]:
        """Get a channel by source node and variable name."""
        return self._channels.get((source_node, var_name))

    def get_channels_for_consumer(self, target_node: str) -> List[StreamChannel]:
        """Get all channels where target_node is the consumer or target is wildcard '*'."""
        return [
            ch for ch in self._channels.values()
            if ch.target_node == target_node or ch.target_node == "*"
        ]

    def clear(self) -> None:
        """Close and remove all channels."""
        for ch in self._channels.values():
            if not ch._closed:
                try:
                    ch.close()
                except Exception:
                    pass
        self._channels.clear()

    def cancel_all(self) -> None:
        """Cancel and drain all active channels to prevent deadlocks."""
        for ch in self._channels.values():
            try:
                ch.cancel()
            except Exception:
                pass

    def remove_channel(self, source_node: str, var_name: str = "data") -> None:
        """Remove a specific channel."""
        key = (source_node, var_name)
        ch = self._channels.pop(key, None)
        if ch and not ch._closed:
            try:
                ch.close()
            except Exception:
                pass

    def get_or_create_channel(
        self,
        source_node: str,
        var_name: str = "data",
        max_buffer: int = 4
    ) -> StreamChannel:
        """Get an existing channel or create it if it doesn't exist."""
        key = (source_node, var_name)
        if key not in self._channels:
            # We don't always know the exact target node when the producer starts
            # yielding, so we use a wildcard '*' for target_node.
            channel = StreamChannel(source_node, "*", var_name, max_buffer)
            self._channels[key] = channel
            log.info(f"StreamRegistry: dynamically created channel {source_node} var='{var_name}'")
        return self._channels[key]


# --- Singleton ---
_stream_registry: Optional[StreamRegistry] = None


def get_stream_registry() -> StreamRegistry:
    """Get or create the global StreamRegistry."""
    global _stream_registry
    if _stream_registry is None:
        _stream_registry = StreamRegistry()
    return _stream_registry

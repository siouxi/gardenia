"""
Plasma Store — In-Memory Object Store
======================================

Shared-memory object store for zero-copy data sharing between
Python and R workers. Replaces Apache Plasma (deprecated in Arrow 12.0)
with Python's multiprocessing.shared_memory + Arrow IPC serialization.

Architecture:
    Producer (Python/R) → serialize DataFrame → SharedMemory segment
    Consumer (R/Python) → mmap same segment → zero-copy read

The shared memory lives in /dev/shm/ on Linux, backed by RAM.
No disk I/O, no data duplication between processes.
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from multiprocessing import shared_memory
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

# Try to import PyArrow
try:
    import pyarrow as pa
    import pyarrow.ipc

    ARROW_AVAILABLE = True
except ImportError:
    ARROW_AVAILABLE = False
    log.warning("PyArrow not installed. PlasmaStore disabled.")

# Try to import pandas
try:
    import pandas as pd

    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


# ---------------------------------------------------------------------------
# PlasmaRef — serializable reference to a shared-memory object
# ---------------------------------------------------------------------------

@dataclass
class PlasmaRef:
    """
    A lightweight, JSON-serializable reference to a shared-memory object.
    This is what gets stored in the VariableRegistry instead of the actual data.
    """

    key: str  # Shared memory segment name
    byte_size: int  # Size in bytes
    num_rows: int  # Row count
    num_columns: int  # Column count
    column_names: List[str]  # Column names for metadata
    shm_path: str  # Full path to /dev/shm/ file (for R mmap)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "byte_size": self.byte_size,
            "num_rows": self.num_rows,
            "num_columns": self.num_columns,
            "column_names": self.column_names,
            "shm_path": self.shm_path,
        }

    def preview_str(self) -> str:
        cols = ", ".join(self.column_names[:5])
        if len(self.column_names) > 5:
            cols += f" ... (+{len(self.column_names) - 5} more)"
        size_kb = self.byte_size / 1024
        if size_kb > 1024:
            size_str = f"{size_kb / 1024:.1f} MB"
        else:
            size_str = f"{size_kb:.1f} KB"
        return (
            f"DataFrame [{self.num_rows} × {self.num_columns}] "
            f"in shared memory ({size_str}) — columns: {cols}"
        )


# ---------------------------------------------------------------------------
# PlasmaStore — the shared-memory object store
# ---------------------------------------------------------------------------

class PlasmaStore:
    """
    In-memory object store using POSIX shared memory.

    Usage:
        store = get_plasma_store()
        ref = store.put("my_matrix", arrow_table_or_dataframe)
        table = store.get("my_matrix")           # Arrow Table (zero-copy)
        df = store.get_as_pandas("my_matrix")     # pandas DataFrame
        store.delete("my_matrix")

    Objects are stored as Arrow IPC buffers in /dev/shm/ segments,
    allowing both Python and R to mmap the same physical RAM pages.
    """

    # Prefix for all shared memory segment names
    SHM_PREFIX = "gardenia_"

    def __init__(self):
        self._segments: Dict[str, shared_memory.SharedMemory] = {}
        self._refs: Dict[str, PlasmaRef] = {}
        self._fallback_dir: Optional[Path] = None  # Disk fallback
        self._sweep_stale_shm()

    def _sweep_stale_shm(self, max_age_seconds: int = 600) -> None:
        """
        Delete stale gardenia_* Arrow files from /dev/shm left by previous
        sessions (i.e. not tracked by this process's _segments dict).
        Files are considered stale if they are older than `max_age_seconds`.
        """
        import glob
        import time
        shm_dir = "/dev/shm"
        if not os.path.isdir(shm_dir):
            return
        pattern = os.path.join(shm_dir, "gardenia_*")
        now = time.time()
        cleaned = 0
        for fpath in glob.glob(pattern):
            try:
                age = now - os.path.getmtime(fpath)
                if age > max_age_seconds:
                    os.unlink(fpath)
                    cleaned += 1
            except OSError:
                pass
        if cleaned:
            log.info(f"PlasmaStore: swept {cleaned} stale /dev/shm files from previous sessions")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def put(
        self,
        key: str,
        data: Any,
        overwrite: bool = True,
    ) -> PlasmaRef:
        """
        Store data in shared memory.

        Args:
            key: Unique identifier for the object
            data: Arrow Table, pandas DataFrame, or dict of columns
            overwrite: If True, replace existing object with same key

        Returns:
            PlasmaRef with metadata about the stored object
        """
        if not ARROW_AVAILABLE:
            raise RuntimeError("PyArrow required for PlasmaStore")

        # Convert to Arrow Table
        table = self._to_arrow_table(data)

        # Serialize to Arrow IPC format (in memory)
        sink = pa.BufferOutputStream()
        with pa.ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        buf = sink.getvalue()
        buf_size = buf.size

        # Clean up existing segment if overwriting
        if overwrite and key in self._segments:
            self.delete(key)

        # Create shared memory segment
        shm_name = f"{self.SHM_PREFIX}{key}_{uuid.uuid4().hex[:8]}"

        try:
            shm = shared_memory.SharedMemory(
                name=shm_name, create=True, size=buf_size
            )
            # Copy the IPC buffer into shared memory
            shm.buf[:buf_size] = buf.to_pybytes()

            self._segments[key] = shm

            # Build the /dev/shm/ path for R to mmap
            shm_path = f"/dev/shm/{shm.name}"
            if not os.path.exists(shm_path):
                # Fallback: some OS may not use /dev/shm
                shm_path = self._write_fallback(key, buf.to_pybytes())

            ref = PlasmaRef(
                key=key,
                byte_size=buf_size,
                num_rows=table.num_rows,
                num_columns=table.num_columns,
                column_names=[field.name for field in table.schema],
                shm_path=shm_path,
            )
            self._refs[key] = ref

            log.info(
                f"PlasmaStore: stored '{key}' — "
                f"{table.num_rows} rows × {table.num_columns} cols, "
                f"{buf_size / 1024:.1f} KB in shared memory"
            )
            return ref

        except MemoryError:
            # /dev/shm is full — fall back to disk instead of crashing the workflow
            log.warning(
                f"PlasmaStore: /dev/shm is full for '{key}' "
                f"({buf_size / 1024 / 1024:.1f} MB). "
                f"Falling back to disk-based IPC. Consider clearing shm or "
                f"reducing chunk size."
            )
            return self._put_fallback(key, table, buf.to_pybytes())
        except (OSError, PermissionError) as e:
            # Shared memory unavailable (permissions, OS limits, etc.)
            log.warning(
                f"PlasmaStore: shared memory failed for '{key}': {e}. "
                f"Falling back to disk-based IPC."
            )
            return self._put_fallback(key, table, buf.to_pybytes())

    def get(self, key: str) -> Optional[pa.Table]:
        """
        Retrieve an Arrow Table from shared memory (zero-copy via mmap).

        Args:
            key: Object identifier

        Returns:
            Arrow Table or None if not found
        """
        if not ARROW_AVAILABLE:
            return None

        ref = self._refs.get(key)
        if ref is None:
            log.warning(f"PlasmaStore: key '{key}' not found")
            return None

        try:
            # Try reading from the shm_path (works for both /dev/shm and fallback)
            if os.path.exists(ref.shm_path):
                with pa.memory_map(ref.shm_path, "r") as mmap:
                    reader = pa.ipc.open_file(mmap)
                    return reader.read_all()

            # If path doesn't exist, try the in-process shared memory
            shm = self._segments.get(key)
            if shm:
                buf = pa.py_buffer(bytes(shm.buf[: ref.byte_size]))
                reader = pa.ipc.open_file(buf)
                return reader.read_all()

            log.warning(
                f"PlasmaStore: cannot access data for '{key}'"
            )
            return None

        except Exception as e:
            log.error(f"PlasmaStore: failed to read '{key}': {e}")
            return None

    def get_as_pandas(self, key: str) -> Optional[Any]:
        """
        Retrieve data as a pandas DataFrame.

        Args:
            key: Object identifier

        Returns:
            pandas DataFrame or None
        """
        table = self.get(key)
        if table is None:
            return None

        if PANDAS_AVAILABLE:
            return table.to_pandas()
        return table

    def get_ref(self, key: str) -> Optional[PlasmaRef]:
        """Get the PlasmaRef for a key without loading data."""
        return self._refs.get(key)

    def contains(self, key: str) -> bool:
        """Check if a key exists in the store."""
        return key in self._refs

    def info(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata about a stored object without loading it.

        Returns:
            Dict with size, rows, columns info, or None
        """
        ref = self._refs.get(key)
        if ref:
            return ref.to_dict()
        return None

    def delete(self, key: str) -> bool:
        """
        Delete a shared memory object and free the segment.

        Args:
            key: Object identifier

        Returns:
            True if deleted, False if not found
        """
        if key not in self._refs:
            return False

        ref = self._refs.pop(key)

        # Close and unlink shared memory
        shm = self._segments.pop(key, None)
        if shm:
            try:
                shm.close()
                shm.unlink()
            except FileNotFoundError:
                # Expected if already unlinked by GC or another process
                pass
            except BaseException as e:
                log.warning(
                    f"PlasmaStore: error cleaning up segment '{key}': {e}"
                )

        # Also remove fallback file if it exists
        if ref.shm_path and not ref.shm_path.startswith("/dev/shm"):
            try:
                if os.path.exists(ref.shm_path):
                    os.unlink(ref.shm_path)
            except Exception:
                pass

        log.debug(f"PlasmaStore: deleted '{key}'")
        return True

    def clear(self) -> None:
        """Delete all stored objects and free all shared memory."""
        keys = list(self._refs.keys())
        for key in keys:
            self.delete(key)
        log.info(f"PlasmaStore: cleared {len(keys)} objects")

    def list_keys(self) -> List[str]:
        """List all stored object keys."""
        return list(self._refs.keys())

    def total_memory(self) -> int:
        """Total bytes currently stored in shared memory."""
        return sum(ref.byte_size for ref in self._refs.values())

    # ------------------------------------------------------------------
    # Register an external shared memory path (e.g., from R)
    # ------------------------------------------------------------------

    def register_external(
        self,
        key: str,
        shm_path: str,
        num_rows: int = 0,
        num_columns: int = 0,
        column_names: Optional[List[str]] = None,
    ) -> PlasmaRef:
        """
        Register a shared-memory file created externally (e.g., by R).
        This allows Python to read it via zero-copy mmap.

        Args:
            key: Unique identifier
            shm_path: Path to the shared memory / IPC file
            num_rows: Row count (metadata)
            num_columns: Column count (metadata)
            column_names: Column names (metadata)

        Returns:
            PlasmaRef for use in VariableRegistry
        """
        byte_size = 0
        if os.path.exists(shm_path):
            byte_size = os.path.getsize(shm_path)

        ref = PlasmaRef(
            key=key,
            byte_size=byte_size,
            num_rows=num_rows,
            num_columns=num_columns,
            column_names=column_names or [],
            shm_path=shm_path,
        )
        self._refs[key] = ref
        log.info(
            f"PlasmaStore: registered external '{key}' from {shm_path}"
        )
        return ref

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _to_arrow_table(self, data: Any) -> pa.Table:
        """Convert various input types to Arrow Table.

        Handles common pandas non-Arrow-native dtypes (categoricals, nullable
        integers, timezone-aware datetimes, custom ExtensionArrays) by retrying
        with safe=False and then falling back to object-dtype casting.
        """
        if isinstance(data, pa.Table):
            return data

        if PANDAS_AVAILABLE and isinstance(data, pd.DataFrame):
            try:
                return pa.Table.from_pandas(data, preserve_index=False)
            except Exception as first_err:
                # Retry: some dtypes (Categorical, Int8Dtype, ExtensionArray)
                # need explicit conversion. Convert problematic columns to
                # their numpy equivalent first.
                log.debug(
                    f"PlasmaStore: Arrow conversion failed ({first_err}), "
                    f"retrying with dtype coercion."
                )
                try:
                    coerced = data.copy()
                    for col in coerced.columns:
                        dtype = coerced[col].dtype
                        if hasattr(dtype, 'numpy_dtype'):
                            # pandas ExtensionDtype (Int8, Float32, etc.)
                            coerced[col] = coerced[col].astype(dtype.numpy_dtype)
                        elif hasattr(dtype, 'categories'):
                            # CategoricalDtype
                            coerced[col] = coerced[col].astype(str)
                    return pa.Table.from_pandas(coerced, preserve_index=False)
                except Exception as second_err:
                    # Last resort: stringify every object-dtype column individually
                    # so Arrow gets a uniform str type it can always accept.
                    log.warning(
                        f"PlasmaStore: dtype coercion also failed ({second_err}), "
                        f"converting object columns to str. Some type info may be lost."
                    )
                    try:
                        coerced2 = data.copy()
                        for col in coerced2.columns:
                            if coerced2[col].dtype == object:
                                coerced2[col] = coerced2[col].astype(str)
                        return pa.Table.from_pandas(coerced2, preserve_index=False)
                    except Exception:
                        # Nuclear option: stringify everything
                        # Use .map() (pandas >= 2.1) with fallback to .applymap()
                        mapper = getattr(data, 'map', None) or data.applymap
                        return pa.Table.from_pandas(
                            mapper(str), preserve_index=False
                        )

        if isinstance(data, dict):
            return pa.table(data)

        if isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                if PANDAS_AVAILABLE:
                    return pa.Table.from_pandas(
                        pd.DataFrame(data), preserve_index=False
                    )
                columns = {}
                for k in data[0].keys():
                    columns[k] = [row.get(k) for row in data]
                return pa.table(columns)
            return pa.table({"value": data})

        raise ValueError(f"Cannot convert {type(data)} to Arrow Table")

    def _get_fallback_dir(self) -> Path:
        """Get or create the fallback directory for disk-based IPC."""
        if self._fallback_dir is None:
            project_root = Path(__file__).resolve().parent.parent.parent
            self._fallback_dir = project_root / ".gardenia_data" / "plasma_fallback"
            self._fallback_dir.mkdir(parents=True, exist_ok=True)
        return self._fallback_dir

    def _write_fallback(self, key: str, buf_bytes: bytes) -> str:
        """Write IPC buffer to disk as fallback."""
        fallback_path = self._get_fallback_dir() / f"{key}.arrow"
        with open(fallback_path, "wb") as f:
            f.write(buf_bytes)
        return str(fallback_path)

    def _put_fallback(
        self, key: str, table: pa.Table, buf_bytes: bytes
    ) -> PlasmaRef:
        """Store via disk fallback when shared memory is unavailable."""
        fallback_path = self._write_fallback(key, buf_bytes)

        ref = PlasmaRef(
            key=key,
            byte_size=len(buf_bytes),
            num_rows=table.num_rows,
            num_columns=table.num_columns,
            column_names=[field.name for field in table.schema],
            shm_path=fallback_path,
        )
        self._refs[key] = ref

        log.info(
            f"PlasmaStore: stored '{key}' on disk fallback — "
            f"{table.num_rows} rows, {len(buf_bytes)} bytes"
        )
        return ref

    def __del__(self):
        """Clean up all shared memory on garbage collection."""
        try:
            self.clear()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_plasma_store: Optional[PlasmaStore] = None
_plasma_store_lock = __import__('threading').Lock()


def get_plasma_store() -> PlasmaStore:
    """Get or create the global PlasmaStore instance (thread-safe)."""
    global _plasma_store
    if _plasma_store is None:
        with _plasma_store_lock:
            if _plasma_store is None:
                _plasma_store = PlasmaStore()
    return _plasma_store


def reset_plasma_store() -> None:
    """Clear and reset the global PlasmaStore (for testing)."""
    global _plasma_store
    with _plasma_store_lock:
        if _plasma_store is not None:
            _plasma_store.clear()
        _plasma_store = None

"""
Arrow/Parquet Storage Layer
============================

High-performance data storage using Apache Arrow and Parquet:
- Zero-copy data access with memory mapping
- Schema inference and validation
- Data preview generation
- Efficient serialization for large datasets
"""

from __future__ import annotations
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import logging

log = logging.getLogger(__name__)

# Try to import PyArrow, gracefully degrade if not available
try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    ARROW_AVAILABLE = True
except ImportError:
    ARROW_AVAILABLE = False
    log.warning("PyArrow not installed. Arrow/Parquet storage disabled.")

# Try to import pandas for DataFrame support
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


@dataclass
class DatasetMetadata:
    """Metadata for a stored dataset"""
    name: str
    path: str
    num_rows: int
    num_columns: int
    columns: List[Dict[str, str]]  # [{name, type}, ...]
    size_bytes: int
    created_at: str
    source_node_id: Optional[str] = None
    preview: Optional[List[Dict[str, Any]]] = None  # Small sample of data (e.g. 5 rows)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "path": self.path,
            "num_rows": self.num_rows,
            "num_columns": self.num_columns,
            "columns": self.columns,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at,
            "source_node_id": self.source_node_id,
            "preview": self.preview,
        }


class ArrowStorage:
    """
    Arrow/Parquet storage manager for workflow data.
    
    Features:
    - Write dataframes to Parquet files
    - Memory-mapped reading for large datasets
    - Schema inspection without full load
    - Data preview (head, sample, stats)
    """
    
    def __init__(self, base_path: Optional[str] = None):
        """
        Initialize storage.
        
        Args:
            base_path: Base directory for storage. Defaults to .gardenia_data/
        """
        if base_path:
            self.base_path = Path(base_path)
        else:
            # Default to .gardenia_data in current working directory
            self.base_path = Path.cwd() / ".gardenia_data"
        
        self.base_path.mkdir(parents=True, exist_ok=True)
        self._datasets: Dict[str, DatasetMetadata] = {}
        self._load_index()
    
    def _load_index(self) -> None:
        """Load dataset index from disk"""
        index_path = self.base_path / "index.json"
        if index_path.exists():
            try:
                with open(index_path, "r") as f:
                    data = json.load(f)
                    for item in data.get("datasets", []):
                        meta = DatasetMetadata(**item)
                        self._datasets[meta.name] = meta
            except Exception as e:
                log.warning(f"Failed to load storage index: {e}")
    
    def _save_index(self) -> None:
        """Save dataset index to disk"""
        index_path = self.base_path / "index.json"
        try:
            with open(index_path, "w") as f:
                json.dump({
                    "datasets": [m.to_dict() for m in self._datasets.values()]
                }, f, indent=2)
        except Exception as e:
            log.error(f"Failed to save storage index: {e}")
    
    def write(
        self,
        name: str,
        data: Any,
        source_node_id: Optional[str] = None,
    ) -> DatasetMetadata:
        """
        Write data to Parquet storage.
        
        Args:
            name: Dataset name (used as filename)
            data: Data to store (DataFrame, Arrow Table, or dict/list)
            source_node_id: Optional source node ID for tracking
        
        Returns:
            DatasetMetadata for the stored data
        """
        if not ARROW_AVAILABLE:
            raise RuntimeError("PyArrow not installed. Cannot write Parquet files.")
        
        file_path = self.base_path / f"{name}.parquet"
        
        # Convert to Arrow Table
        table = self._to_arrow_table(data)
        
        # Write Parquet
        pq.write_table(table, str(file_path), compression='snappy')
        
        # Get stats
        from datetime import datetime
        file_size = file_path.stat().st_size

        # Extract preview (first 5 rows)
        preview_data = []
        try:
            # First 5 rows
            preview_table = table.slice(0, 5)
            # Limit columns to first 10 to avoid huge JSON if wide dataset
            if len(preview_table.column_names) > 10:
                 preview_table = preview_table.select(list(range(10)))
            
            preview_data = preview_table.to_pylist()
            log.info(f"Generated preview for '{name}': {len(preview_data)} rows")
        except Exception as e:
            log.error(f"Failed to generate preview for '{name}': {e}")
        
        metadata = DatasetMetadata(
            name=name,
            path=str(file_path),
            num_rows=table.num_rows,
            num_columns=table.num_columns,
            columns=[
                {"name": field.name, "type": str(field.type)}
                for field in table.schema
            ],
            size_bytes=file_size,
            created_at=datetime.now().isoformat(),
            source_node_id=source_node_id,
            preview=preview_data,
        )
        
        self._datasets[name] = metadata
        self._save_index()
        
        log.info(f"Stored dataset '{name}': {table.num_rows} rows, {file_size} bytes")
        return metadata
    
    def _to_arrow_table(self, data: Any) -> "pa.Table":
        """Convert various data types to Arrow Table"""
        if not ARROW_AVAILABLE:
            raise RuntimeError("PyArrow not installed")
        
        if isinstance(data, pa.Table):
            return data
        
        if PANDAS_AVAILABLE and isinstance(data, pd.DataFrame):
            return pa.Table.from_pandas(data)
        
        if isinstance(data, dict):
            # Assume dict of columns
            return pa.table(data)
        
        if isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                # List of records
                if PANDAS_AVAILABLE:
                    df = pd.DataFrame(data)
                    return pa.Table.from_pandas(df)
                else:
                    # Manual conversion
                    columns = {}
                    for key in data[0].keys():
                        columns[key] = [row.get(key) for row in data]
                    return pa.table(columns)
            else:
                # Simple list -> single column
                return pa.table({"value": data})
        
        raise ValueError(f"Cannot convert {type(data)} to Arrow Table")
    
    def read(self, name: str, memory_map: bool = True) -> Optional[Any]:
        """
        Read a dataset from storage.
        
        Args:
            name: Dataset name
            memory_map: Use memory mapping for large file (default True)
        
        Returns:
            pandas DataFrame if pandas available, else Arrow Table
        """
        if not ARROW_AVAILABLE:
            raise RuntimeError("PyArrow not installed. Cannot read Parquet files.")
        
        if name not in self._datasets:
            log.warning(f"Dataset '{name}' not found")
            return None
        
        file_path = self._datasets[name].path
        
        try:
            table = pq.read_table(file_path, memory_map=memory_map)
            
            if PANDAS_AVAILABLE:
                return table.to_pandas()
            return table
        
        except Exception as e:
            log.error(f"Failed to read dataset '{name}': {e}")
            return None
    
    def read_schema(self, name: str) -> Optional[List[Dict[str, str]]]:
        """Get schema without loading full data"""
        if not ARROW_AVAILABLE:
            return None
        
        if name not in self._datasets:
            return None
        
        file_path = self._datasets[name].path
        
        try:
            schema = pq.read_schema(file_path)
            return [
                {"name": field.name, "type": str(field.type)}
                for field in schema
            ]
        except Exception as e:
            log.error(f"Failed to read schema: {e}")
            return None
    
    def preview(
        self,
        name: str,
        n_rows: int = 10,
        include_stats: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """
        Get a preview of a dataset.
        
        Args:
            name: Dataset name
            n_rows: Number of rows to include
            include_stats: Include basic statistics
        
        Returns:
            Dict with preview data
        """
        if not ARROW_AVAILABLE:
            return None
        
        if name not in self._datasets:
            return None
        
        file_path = self._datasets[name].path
        
        try:
            # Read only the first n_rows
            table = pq.read_table(
                file_path,
                memory_map=True,
            ).slice(0, n_rows)
            
            result = {
                "metadata": self._datasets[name].to_dict(),
                "columns": [field.name for field in table.schema],
                "rows": table.to_pylist(),
            }
            
            if include_stats and PANDAS_AVAILABLE:
                df = self.read(name)
                if df is not None:
                    result["stats"] = df.describe().to_dict()
            
            return result
        
        except Exception as e:
            log.error(f"Failed to get preview: {e}")
            return None
    
    def list_datasets(self) -> List[DatasetMetadata]:
        """List all stored datasets"""
        return list(self._datasets.values())
    
    def delete(self, name: str) -> bool:
        """Delete a dataset"""
        if name not in self._datasets:
            return False
        
        file_path = Path(self._datasets[name].path)
        try:
            if file_path.exists():
                file_path.unlink()
            del self._datasets[name]
            self._save_index()
            return True
        except Exception as e:
            log.error(f"Failed to delete dataset '{name}': {e}")
            log.error(f"Failed to delete dataset '{name}': {e}")
            return False
    
    def clear_all(self) -> bool:
        """Delete all datasets"""
        success = True
        for name in list(self._datasets.keys()):
            if not self.delete(name):
                success = False
        return success
    
    def get_metadata(self, name: str) -> Optional[DatasetMetadata]:
        """Get metadata for a dataset"""
        return self._datasets.get(name)


# Module-level instance
_storage: Optional[ArrowStorage] = None


def get_storage(base_path: Optional[str] = None) -> ArrowStorage:
    """Get or create the global storage instance"""
    global _storage
    if _storage is None:
        _storage = ArrowStorage(base_path)
    return _storage

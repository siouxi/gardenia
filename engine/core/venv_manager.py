"""
Virtual Environment Manager
============================

Creates and caches lightweight per-node virtual environments.
Each unique dependency set maps to a single cached venv via content hashing.

Layout:
    .venv/workers/<hash12>/     ← micro-venv
    .venv/workers/<hash12>.deps ← deps manifest for debugging

Usage:
    mgr = VenvManager()
    python_path = mgr.ensure_venv(["biopython==1.79", "numpy"])
    # python_path = "/abs/path/.venv/workers/a3f8c1b2d4e6/bin/python"
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

log = logging.getLogger(__name__)

# Root directory for worker micro-venvs (relative to project root)
_DEFAULT_WORKERS_DIR = ".venv/workers"


def _find_project_root() -> Path:
    """Walk up from the engine dir to find the project root (where .venv lives)."""
    # engine/core/venv_manager.py → engine/core → engine → project_root
    here = Path(__file__).resolve().parent  # engine/core
    engine_dir = here.parent               # engine
    project_root = engine_dir.parent       # project_root
    return project_root


def _hash_deps(deps: List[str]) -> str:
    """
    Create a deterministic short hash for a sorted dependency list.
    Returns 12-hex-char string (48 bits — ~280 trillion combos).
    """
    canonical = "|".join(sorted(d.strip().lower() for d in deps if d.strip()))
    return hashlib.sha256(canonical.encode()).hexdigest()[:12]


class VenvManager:
    """
    Manages per-node micro virtual environments.

    - Hashes the dependency list for deterministic caching
    - Creates venvs lazily on first use
    - Reuses existing venvs for identical dependency sets
    """

    def __init__(self, workers_dir: Optional[str] = None):
        if workers_dir:
            self._workers_dir = Path(workers_dir)
        else:
            self._workers_dir = _find_project_root() / _DEFAULT_WORKERS_DIR

        self._workers_dir.mkdir(parents=True, exist_ok=True)
        self._cache: Dict[str, Path] = {}  # hash → venv path (in-memory cache)
        log.info(f"VenvManager: workers_dir = {self._workers_dir}")

    @property
    def workers_dir(self) -> Path:
        return self._workers_dir

    def get_venv_python(self, deps: List[str]) -> Optional[Path]:
        """
        Get the cached venv python path for given deps, or None if not cached.
        Does NOT create the venv.
        """
        if not deps:
            return None

        key = _hash_deps(deps)
        venv_dir = self._workers_dir / key
        python_path = venv_dir / "bin" / "python"

        if python_path.exists():
            return python_path
        return None

    def ensure_venv(self, deps: List[str]) -> Path:
        """
        Ensure a venv exists for the given dependency list.
        Creates it if it doesn't exist, otherwise returns the cached path.

        Args:
            deps: List of pip requirement strings (e.g. ["biopython==1.79", "numpy"])

        Returns:
            Path to the venv's python executable

        Raises:
            RuntimeError: If venv creation or pip install fails
        """
        if not deps:
            raise ValueError("Cannot create venv with empty dependency list")

        key = _hash_deps(deps)

        # In-memory cache hit
        if key in self._cache:
            return self._cache[key]

        venv_dir = self._workers_dir / key
        python_path = venv_dir / "bin" / "python"
        deps_manifest = self._workers_dir / f"{key}.deps"

        # Disk cache hit — venv already exists
        if python_path.exists():
            log.info(f"VenvManager: cache hit for {key} ({len(deps)} deps)")
            self._cache[key] = python_path
            return python_path

        # Create new micro-venv
        log.info(f"VenvManager: creating venv {key} for deps: {deps}")

        try:
            # 1. Create venv (lightweight, no pip bundled)
            subprocess.run(
                [sys.executable, "-m", "venv", "--without-pip", str(venv_dir)],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )

            # 2. Install pip into the venv using ensurepip
            subprocess.run(
                [str(python_path), "-m", "ensurepip", "--upgrade"],
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )

            # 3. Install dependencies
            install_cmd = [
                str(python_path), "-m", "pip", "install",
                "--quiet", "--disable-pip-version-check",
                *deps,
            ]
            result = subprocess.run(
                install_cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 min max for pip install
            )

            if result.returncode != 0:
                # Cleanup broken venv
                shutil.rmtree(venv_dir, ignore_errors=True)
                raise RuntimeError(
                    f"pip install failed (exit {result.returncode}):\n{result.stderr}"
                )

            # 4. Write deps manifest for debugging
            deps_manifest.write_text(json.dumps({
                "hash": key,
                "deps": sorted(deps),
                "python": str(python_path),
            }, indent=2))

            log.info(f"VenvManager: venv {key} ready at {venv_dir}")
            self._cache[key] = python_path
            return python_path

        except subprocess.TimeoutExpired:
            shutil.rmtree(venv_dir, ignore_errors=True)
            raise RuntimeError(f"Venv creation timed out for deps: {deps}")
        except subprocess.CalledProcessError as e:
            shutil.rmtree(venv_dir, ignore_errors=True)
            raise RuntimeError(f"Venv creation failed: {e.stderr or e.stdout or str(e)}")

    def clear_venv(self, deps: List[str]) -> bool:
        """Remove a cached venv for the given deps. Returns True if removed."""
        key = _hash_deps(deps)
        venv_dir = self._workers_dir / key
        deps_manifest = self._workers_dir / f"{key}.deps"

        removed = False
        if venv_dir.exists():
            shutil.rmtree(venv_dir)
            removed = True
        if deps_manifest.exists():
            deps_manifest.unlink()

        self._cache.pop(key, None)
        return removed

    def clear_all(self) -> int:
        """Remove all cached venvs. Returns count of removed venvs."""
        count = 0
        for item in self._workers_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
                count += 1
            elif item.suffix == ".deps":
                item.unlink()
        self._cache.clear()
        log.info(f"VenvManager: cleared {count} cached venvs")
        return count

    def list_venvs(self) -> List[Dict]:
        """List all cached venvs with their dependency info."""
        venvs = []
        for manifest in sorted(self._workers_dir.glob("*.deps")):
            try:
                info = json.loads(manifest.read_text())
                venv_dir = self._workers_dir / info["hash"]
                info["exists"] = venv_dir.exists()
                info["size_mb"] = sum(
                    f.stat().st_size for f in venv_dir.rglob("*") if f.is_file()
                ) / (1024 * 1024) if venv_dir.exists() else 0
                venvs.append(info)
            except Exception:
                continue
        return venvs


# --- Singleton ---
_venv_manager: Optional[VenvManager] = None


def get_venv_manager() -> VenvManager:
    """Get or create the global VenvManager."""
    global _venv_manager
    if _venv_manager is None:
        _venv_manager = VenvManager()
    return _venv_manager

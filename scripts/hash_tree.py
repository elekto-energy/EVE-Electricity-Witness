#!/usr/bin/env python3
"""
hash_tree.py — Compute SHA-256 for all files in a directory tree.

Produces:
  - files.sha256   (per-file hashes, sorted alphabetically)
  - root_hash.txt  (single hash over all file hashes)

Usage:
  python scripts/hash_tree.py data/canonical/entsoe_day_ahead/2026-02/
  python scripts/hash_tree.py data/raw/eurostat_hdd/ --output manifests/

Part of ELEKTO EU Evidence Pipeline.
TR2: All ingests produce manifest + SHA256 + root_hash.
"""

import hashlib
import json
import sys
from pathlib import Path
from datetime import datetime, timezone


def sha256_file(path: Path) -> str:
    """Compute SHA-256 hash of a single file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def hash_tree(directory: Path) -> dict:
    """
    Hash all files in directory tree.
    
    Returns:
        {
            "files": [{"path": "relative/path", "sha256": "...", "size_bytes": N}, ...],
            "root_hash": "sha256 of sorted concatenated hashes",
            "computed_at": "ISO datetime"
        }
    """
    directory = Path(directory).resolve()
    if not directory.is_dir():
        raise ValueError(f"Not a directory: {directory}")

    entries = []
    for path in sorted(directory.rglob("*")):
        if path.is_file() and not path.name.startswith("."):
            rel = path.relative_to(directory)
            entries.append({
                "path": str(rel).replace("\\", "/"),
                "sha256": sha256_file(path),
                "size_bytes": path.stat().st_size,
            })

    # Root hash: sort hashes alphabetically, concatenate, hash again
    sorted_hashes = sorted(e["sha256"] for e in entries)
    root_hash = hashlib.sha256("".join(sorted_hashes).encode()).hexdigest()

    return {
        "directory": str(directory),
        "file_count": len(entries),
        "files": entries,
        "root_hash": root_hash,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python hash_tree.py <directory> [--output <dir>]")
        sys.exit(1)

    target = Path(sys.argv[1])
    output_dir = Path(sys.argv[3]) if "--output" in sys.argv else target

    result = hash_tree(target)

    # Write files.sha256
    sha_path = output_dir / "files.sha256"
    with open(sha_path, "w") as f:
        for entry in result["files"]:
            f.write(f"{entry['sha256']}  {entry['path']}\n")

    # Write root_hash.txt
    root_path = output_dir / "root_hash.txt"
    with open(root_path, "w") as f:
        f.write(f"{result['root_hash']}\n")

    # Write full result as JSON
    json_path = output_dir / "hash_tree.json"
    with open(json_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"[hash_tree] {result['file_count']} files hashed")
    print(f"[hash_tree] root_hash: {result['root_hash']}")
    print(f"[hash_tree] Output: {sha_path}, {root_path}, {json_path}")


if __name__ == "__main__":
    main()

import hashlib
import os
from pathlib import Path


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_files(root: Path):
    for p in sorted(root.rglob("*")):
        if p.is_file():
            yield p


def write_files_sha256(input_dir: Path, out_path: Path):
    lines = []
    for p in iter_files(input_dir):
        rel = p.relative_to(input_dir).as_posix()
        digest = sha256_file(p)
        size = p.stat().st_size
        lines.append(f"{digest}  {size}  {rel}")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def root_hash_of_files_sha256(files_sha256_path: Path) -> str:
    # Root hash is sha256 over the exact bytes of files.sha256 (deterministic order)
    data = files_sha256_path.read_bytes()
    return hashlib.sha256(data).hexdigest()


if __name__ == "__main__":
    import argparse, json
    from datetime import datetime, timezone

    ap = argparse.ArgumentParser()
    ap.add_argument("--input_dir", required=True)
    ap.add_argument("--out_dir", required=True)
    ap.add_argument("--run_id", required=True)
    args = ap.parse_args()

    input_dir = Path(args.input_dir).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    files_sha256 = out_dir / f"{args.run_id}.files.sha256"
    write_files_sha256(input_dir, files_sha256)

    root_hash = root_hash_of_files_sha256(files_sha256)
    root_hash_path = out_dir / f"{args.run_id}.root_hash.txt"
    root_hash_path.write_text(root_hash + "\n", encoding="utf-8")

    manifest = {
        "run_id": args.run_id,
        "created_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "input_dir": str(input_dir),
        "file_count": sum(1 for _ in iter_files(input_dir)),
        "files_sha256_path": str(files_sha256),
        "root_hash_path": str(root_hash_path),
    }
    (out_dir / f"{args.run_id}.manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print("OK")

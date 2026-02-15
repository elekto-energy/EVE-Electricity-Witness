import subprocess
import argparse
from pathlib import Path

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run_id", required=True)
    ap.add_argument("--input_dir", required=True)
    ap.add_argument("--out_dir", required=True)
    args = ap.parse_args()

    here = Path(__file__).resolve().parent
    hash_tree = here / "hash_tree.py"
    subprocess.check_call(
        ["python", str(hash_tree), "--run_id", args.run_id, "--input_dir", args.input_dir, "--out_dir", args.out_dir]
    )

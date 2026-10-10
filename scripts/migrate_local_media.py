from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0,str(ROOT))


def main_cli()->int:
    parser=argparse.ArgumentParser(description="Copy Voxera local uploads to its configured private S3-compatible bucket.")
    parser.add_argument("--data-dir",type=Path,default=os.environ.get("VOXERA_LOCAL_DATA_DIR"))
    args=parser.parse_args()
    if not args.data_dir:
        parser.error("provide --data-dir or set VOXERA_LOCAL_DATA_DIR")

    from backend.media_storage import MediaStorage

    storage=MediaStorage.from_environment()
    if not storage.enabled:
        parser.error("configure all VOXERA_S3_* settings before migrating media")
    total_files=0
    total_bytes=0
    for directory_name,namespace in (("uploads","uploads"),("profile-photos","profile-photos")):
        directory=Path(args.data_dir)/directory_name
        if not directory.exists():
            continue
        if not directory.is_dir():
            raise NotADirectoryError(f"Expected a media directory: {directory}")
        for path in sorted(directory.iterdir()):
            if path.is_symlink():
                raise ValueError(f"Refusing to copy a symlink: {path}")
            if not path.is_file() or path.name.endswith((".part",".download")):
                continue
            storage.save(path,namespace)
            total_files+=1
            total_bytes+=path.stat().st_size
    print(f"Copied {total_files} files ({total_bytes:,} bytes) to the configured private bucket.")
    return 0


if __name__=="__main__":
    raise SystemExit(main_cli())

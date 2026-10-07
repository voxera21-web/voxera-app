from pathlib import Path

from huggingface_hub import snapshot_download

ROOT=Path(__file__).resolve().parents[1]
models=ROOT/"models"
models.mkdir(exist_ok=True)
for repo,destination in [
    ("Systran/faster-whisper-small",models/"faster-whisper-small"),
    ("facebook/mms-1b-all",models/"mms-1b-all"),
    ("facebook/nllb-200-distilled-600M",models/"nllb-200-distilled-600m"),
]:
    print(f"Downloading {repo} into {destination} …",flush=True)
    snapshot_download(repo_id=repo,local_dir=str(destination))
    print(f"Finished {repo}.",flush=True)
print("Models are stored locally. The running app makes no remote model calls.")

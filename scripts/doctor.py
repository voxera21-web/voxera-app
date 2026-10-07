from __future__ import annotations

import importlib.util
import json
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
checks=[]

def report(name: str, okay: bool, fix: str=""):
    checks.append(okay)
    print(f"{'PASS' if okay else 'NEEDS ACTION'}  {name}")
    if not okay and fix:print(f"       Fix: {fix}")

report(f"Python {sys.version_info.major}.{sys.version_info.minor}",sys.version_info>=(3,11),"Install Python 3.11+ and rerun start.ps1 (Windows) or start.sh (macOS).")
for package in ("fastapi","uvicorn","bcrypt","qrcode"):
    report(f"Python package: {package}",importlib.util.find_spec(package) is not None,"Run the app startup script once to install backend/requirements.txt.")
try:
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags",timeout=1) as response:tags=json.loads(response.read())
    installed={model.get("name","") for model in tags.get("models",[])}
    report("Ollama is running",True)
    report("Local chat model present",any(name.startswith(("qwen2.5:3b-instruct","llama3.2:3b")) for name in installed),"Install Ollama and run: ollama pull qwen2.5:3b-instruct")
except (OSError,urllib.error.URLError):
    report("Ollama is running",False,"Install Ollama and start it. The app still runs with its deterministic local fallback.")
report("Whisper model present",(ROOT/"models"/"faster-whisper-small").exists(),"Run scripts/download_models.ps1 or scripts/download_models.py.")
report("MMS and translation models present",(ROOT/"models"/"mms-1b-all").exists() and (ROOT/"models"/"nllb-200-distilled-600m").exists(),"Run scripts/download_models.ps1; allow several gigabytes for the language models.")
report("Local HTTPS certificates present",(ROOT/"certs"/"voxera.pem").exists() and (ROOT/"certs"/"voxera-key.pem").exists(),"Use mkcert as described in README.md for Android microphone access.")
sock=socket.socket();sock.settimeout(.3);busy=sock.connect_ex(("127.0.0.1",4173))==0;sock.close()
report("Port 4173 is free",not busy,"Stop the other local server or set a different port in the launch command.")
print("\nVoxera is ready." if all(checks) else "\nSome optional components need setup; see the fix notes above.")

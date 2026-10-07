#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python ]]; then echo "Start the app once first to create .venv." >&2; exit 1; fi
.venv/bin/python -m pip install -r backend/requirements-ai.txt
.venv/bin/python scripts/download_models.py
if command -v ollama >/dev/null 2>&1; then ollama pull qwen2.5:3b-instruct; else echo "Install Ollama, then run: ollama pull qwen2.5:3b-instruct"; fi

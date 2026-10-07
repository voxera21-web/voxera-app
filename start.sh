#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then PYTHON=python3; else echo "Python 3.11 or newer is required." >&2; exit 1; fi
if [[ ! -x .venv/bin/python ]]; then "$PYTHON" -m venv .venv; fi
if [[ ! -f .venv/voxera-dependencies.ready ]]; then
  .venv/bin/python -m pip install -r backend/requirements.txt
  touch .venv/voxera-dependencies.ready
fi
if [[ -f certs/voxera.pem && -f certs/voxera-key.pem ]]; then
  exec .venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port "${VOXERA_PORT:-4173}" --ssl-certfile certs/voxera.pem --ssl-keyfile certs/voxera-key.pem
fi
exec .venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port "${VOXERA_PORT:-4173}"

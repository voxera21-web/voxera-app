$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.venv\Scripts\python.exe')) { throw 'Start the app once first to create .venv.' }
$python = '.venv\Scripts\python.exe'
& $python -m pip install -r backend\requirements-ai.txt
if ($LASTEXITCODE -ne 0) { throw 'AI runtime dependencies could not be installed.' }
& $python scripts\download_models.py
if ($LASTEXITCODE -ne 0) { throw 'Local speech/translation model download failed.' }
if (Get-Command ollama -ErrorAction SilentlyContinue) {
  ollama pull qwen2.5:3b-instruct
} else {
  Write-Host 'Install Ollama, then run: ollama pull qwen2.5:3b-instruct' -ForegroundColor Yellow
}

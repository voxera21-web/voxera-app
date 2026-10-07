$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
if ($pythonCommand) { $pythonArgs = @('-3') }
else {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  $pythonArgs = @()
}
if (-not $pythonCommand) {
  Write-Host 'Python 3.11 or newer is required. Install Python, then run this script again.' -ForegroundColor Yellow
  exit 1
}
$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  & $pythonCommand.Source @pythonArgs -m venv .venv
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the project environment.' }
}
if (-not (Test-Path '.venv\voxera-dependencies.ready')) {
  & $venvPython -m pip install -r backend\requirements.txt
  if ($LASTEXITCODE -ne 0) { throw 'Could not install local app dependencies.' }
  New-Item -ItemType File '.venv\voxera-dependencies.ready' -Force | Out-Null
}
$port = if ($env:VOXERA_PORT) { $env:VOXERA_PORT } else { '4173' }
$serverArgs = @('-m','uvicorn','backend.main:app','--host','0.0.0.0','--port',$port)
if ((Test-Path 'certs\voxera.pem') -and (Test-Path 'certs\voxera-key.pem')) {
  $serverArgs += @('--ssl-certfile','certs\voxera.pem','--ssl-keyfile','certs\voxera-key.pem')
}
& $venvPython @serverArgs

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = process.env.PORT || '4173';

if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error(`Invalid PORT value: ${port}`);
  process.exitCode = 1;
} else {
  const localPython = process.platform === 'win32'
    ? resolve(root, '.venv', 'Scripts', 'python.exe')
    : resolve(root, '.venv', 'bin', 'python');
  const python = process.env.PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
  const server = spawn(python, [
    '-m', 'uvicorn', 'backend.main:app',
    '--host', '0.0.0.0',
    '--port', String(Number(port)),
    '--workers', '1'
  ], { cwd: root, env: process.env, stdio: 'inherit' });

  server.on('error', error => {
    console.error(`Could not start Voxera using "${python}": ${error.message}`);
    process.exitCode = 1;
  });
  server.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 1;
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!server.killed) server.kill(signal);
    });
  }
}

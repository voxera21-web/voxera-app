import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const localPython = process.platform === 'win32'
  ? resolve('.venv', 'Scripts', 'python.exe')
  : resolve('.venv', 'bin', 'python');
const python = process.env.PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
const compile = spawnSync(python, ['-m', 'compileall', '-q', 'backend'], { stdio: 'inherit' });

if (compile.error) {
  console.error(`Could not run Python build check using "${python}": ${compile.error.message}`);
  process.exitCode = 1;
} else if (compile.status !== 0) {
  process.exitCode = compile.status ?? 1;
}

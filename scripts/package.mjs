import { mkdir, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('artifacts', { recursive: true });
await copyFile('plugin-manifest.json', 'dist/plugin-manifest.json');
await rm('artifacts/project-widget.zip', { force: true });
const result = spawnSync(
  'zip',
  ['-qr', '../artifacts/project-widget.zip', 'app', 'plugin-manifest.json'],
  { cwd: 'dist', stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status || 1);
console.log('Packaged artifacts/project-widget.zip (entry: /app/widget.html)');

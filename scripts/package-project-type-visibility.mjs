import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { patchProjectTypeVisibility } from './patch-project-type-visibility.mjs';

const [
  inputPath = 'artifacts/recovery/project-widget-r220-1c032eb.zip',
  outputPath = 'artifacts/project-widget.zip',
] = process.argv.slice(2).map((path) => resolve(path));
const input = resolve(inputPath);
const output = resolve(outputPath);
await mkdir(dirname(output), { recursive: true });
const scratch = await mkdtemp(join(dirname(output), '.project-type-'));
try {
  const contents = join(scratch, 'widget');
  execFileSync('unzip', ['-q', input, '-d', contents]);
  const bundle = join(contents, 'app/assets/widget-client-project-links.js');
  const patched = patchProjectTypeVisibility(await readFile(bundle, 'utf8'));
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: patched });
  await writeFile(bundle, patched);
  const refinements = join(contents, 'app/assets/widget-refinements.css');
  const selectorStyles = await readFile(
    new URL('../app/src/components/bomDisplaySelector.css', import.meta.url),
    'utf8',
  );
  await writeFile(refinements, `${await readFile(refinements, 'utf8')}\n${selectorStyles}`);
  const candidate = join(scratch, 'candidate.zip');
  execFileSync('zip', ['-qr', candidate, 'app', 'plugin-manifest.json'], { cwd: contents });
  execFileSync('unzip', ['-tq', candidate]);
  await rename(candidate, output);
  console.log(`Packaged ${output}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

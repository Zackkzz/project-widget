/** Extract reference definitions without executing or rewriting any Deluge. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const source = await readFile('Sungrow_Service__Australia_.ds', 'utf8');
const dir = 'deluge_scripts/project';
await mkdir(`${dir}/workflows`, { recursive: true });
const start = source.indexOf('\t\tform Project\n');
const end = source.indexOf('\t\tform Project_Claim_Legacy\n', start);
if (start < 0 || end < 0) throw new Error('Project form boundaries were not found.');
await writeFile(`${dir}/form.ds`, source.slice(start, end));
const workflowStart = source.indexOf('\t\tworkflow\n');
const workflowEnd = source.indexOf('\t\tschedule\n', workflowStart);
const section = source.slice(workflowStart, workflowEnd);
const matches = [...section.matchAll(/^\t{3}(\w+) as "([^"\n]*)"\n/gm)];
let count = 0;
for (let index = 0; index < matches.length; index++) {
  const match = matches[index];
  const block = section.slice(match.index, matches[index + 1]?.index ?? section.length);
  if (!/^\t{4}form = Project$/m.test(block)) continue;
  const line = source.slice(0, workflowStart + match.index).split('\n').length;
  await writeFile(
    `${dir}/workflows/${match[1]}.ds`,
    `// Source: Sungrow_Service__Australia_.ds:${line}\n${block}`,
  );
  count++;
}
console.log(`Extracted Project schema and ${count} form workflows into ${dir}.`);

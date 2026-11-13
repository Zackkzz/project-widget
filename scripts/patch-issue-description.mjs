import { buildSync } from 'esbuild';

/** Reuses the existing table disclosure controls for long Issue Description values. */
export function patchIssueDescription(bundle) {
  // The preserved table declares the condition in the same comma-separated cell expression.
  const before = ',_=d==="warranty-detail-table"&&x.name==="Items";';
  if (bundle.split(before).length !== 2)
    throw new Error('Issue description table cell anchor did not match.');
  const runtime = buildSync({
    entryPoints: ['app/src/components/subforms/FoldedText.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'textDisclosure',
    target: 'es2022',
    jsx: 'transform',
  }).outputFiles[0].text;
  const start = 'function is({fields:l,';
  if (bundle.split(start).length !== 2)
    throw new Error('Shared detail table anchor did not match.');
  const content = '_&&typeof p=="string"&&p.trim()?r.jsx(yj,{text:p}):p';
  if (bundle.split(content).length !== 2)
    throw new Error('Existing table disclosure renderer did not match.');
  return (
    runtime +
    bundle
      .replace(start, 'const IssueDescriptionPreview=textDisclosure.createFoldedText(C);' + start)
      .replace(
        before,
        ',_=d==="warranty-detail-table"&&x.name==="Items",foldIssue=d==="issue-detail-table"&&x.name==="Issue_Description";',
      )
      .replace(
        content,
        'foldIssue&&typeof p=="string"&&p.trim()?r.jsx(IssueDescriptionPreview,{text:p}):' +
          content,
      )
  );
}

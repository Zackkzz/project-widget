import { buildSync } from 'esbuild';

/** Replace only the legacy two-pane column picker; retain the host preference persistence. */
export function patchColumnSettings(bundle) {
  const start = bundle.indexOf('function wj({columns:l,selected:o,order:c,');
  const terminator = 'document.body)]})}';
  const end = bundle.indexOf(terminator, start);
  if (start < 0 || end < start || !bundle.slice(start, end).includes('Choose and arrange columns'))
    throw new Error('The legacy column picker boundaries did not match.');
  const component = buildSync({
    entryPoints: ['app/src/components/columns/ColumnSettings.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'columnSettings',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2022',
  }).outputFiles[0].text;
  const replacement =
    'const wj=columnSettings.createColumnSettings(C,Hl.createPortal,$0,{normalizeSelection:su,normalizeOrder:Mn,defaults:qi});';
  return component + bundle.slice(0, start) + replacement + bundle.slice(end + terminator.length);
}

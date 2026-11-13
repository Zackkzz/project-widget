import { buildSync } from 'esbuild';

/** Change the Client popup order without affecting Project, Manager or PO detail layouts. */
export function patchClientDetailOrder(bundle) {
  const before = '(l==="Client"?Eg(m)-Eg(f):0)||c(m).localeCompare(c(f))';
  if (bundle.split(before).length !== 2) throw new Error('Client detail comparator did not match.');
  const runtime = buildSync({
    entryPoints: ['app/src/domain/clientDetailOrder.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'clientDetailOrder',
    target: 'es2022',
  }).outputFiles[0].text;
  return (
    runtime +
    bundle.replace(
      before,
      'l==="Client"?clientDetailOrder.compareClientDetailFields(m,f,c):c(m).localeCompare(c(f))',
    )
  );
}

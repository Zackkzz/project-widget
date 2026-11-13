/** Scope the compact table ending to the read-only PO section. */
export function patchPoDisplay(bundle) {
  const before = 'open:!0,className:"record-section",children:[r.jsx(Sf,{title:B.title';
  if (bundle.split(before).length !== 2)
    throw new Error('Project detail section did not match for the PO display refinement.');
  return bundle.replace(
    before,
    'open:!0,className:B.name==="PO"?"record-section po-display-section":"record-section",children:[r.jsx(Sf,{title:B.title',
  );
}

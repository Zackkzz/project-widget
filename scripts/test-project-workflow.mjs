import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { patchProjectWorkflow } from './patch-project-workflow.mjs';

// Execute the preserved build's actual filtering and serialization functions, without Zoho writes.
const original = await readFile('dist/app/assets/widget-DwtEDLVK.js', 'utf8');
const bundle = patchProjectWorkflow(original);
const hydrateStart = bundle.indexOf('async function PS(');
const hydrateEnd = bundle.indexOf('function Yo(', hydrateStart);
const loaderEnd = bundle.indexOf('var h0=');
assert.ok(loaderEnd > 0);
const hydrate = vm.runInNewContext(
  bundle.slice(0, loaderEnd) + `\n(${bundle.slice(hydrateStart, hydrateEnd)})`,
  {
    xa: async (_, request) => {
      assert.equal(request.report_name, 'Rectification_Projects');
      assert.equal(request.criteria, '(ID == 3932750000199999999)');
      return {
        rows: [
          {
            ID: '3932750000199999999',
            Software_Packages: [{ Software_Type: 'Master', Software_Version: '2.0' }],
          },
        ],
      };
    },
  },
);
const linked = await hydrate({}, [
  {
    Type_field: 'Software',
    Rectification_Project: { ID: '3932750000199999999' },
    Software_Packages: [],
  },
]);
assert.equal(linked[0].Software_Packages[0].Software_Version, '2.0');
const editor = bundle.indexOf('function Qj(');
const start = bundle.indexOf('le=c.filter(', editor) + 3;
const end = bundle.indexOf(',ge=', start);
assert.ok(start > editor && end > start);
const fields = [
  'Product_Line',
  'BX_Code',
  'State',
  'EXW_Factory_Date',
  'Estimated_Commission_Date',
  'Commission_Complete_Date',
  'Warranty_Commencement_Date',
  'Warranty_End_Date',
].map((name) => ({ name }));
const statuses = [
  'Pre-Sale Consulting & HL Design',
  'Site Design',
  'Manufacturing',
  'Installing',
  'Commissioning',
  'HP Testing',
  'O&M',
  'Out of Warranty',
];
for (const type of [
  'Sub 5MW PV&Storage',
  'Utility',
  'C&I - Project Team',
  'C&I - Direct Sales',
  'C&I - Channel',
]) {
  const channel = ['C&I - Direct Sales', 'C&I - Channel'].includes(type);
  for (const [level, status] of statuses.entries()) {
    const names = vm
      .runInNewContext(bundle.slice(start, end), {
        c: fields,
        Se: channel,
        De: level,
        Zr: statuses,
        Ij: new Set(['Product_Line']),
        R: { states: ['NSW'] },
        x: { values: { Project_Type: type } },
        S: { values: { Project_Type: type, Status: status, EXW_Factory_Date: '2026-11-12' } },
      })
      .map((field) => field.name);
    assert.equal(names.includes('BX_Code'), !channel);
    assert.equal(names.includes('Product_Line'), false);
    assert.equal(names.includes('EXW_Factory_Date'), !channel);
    assert.equal(names.includes('Estimated_Commission_Date'), !channel);
    assert.equal(names.includes('Commission_Complete_Date'), level >= 4);
    assert.equal(names.includes('Warranty_End_Date'), level >= 6);
  }
}
const serializer = bundle.slice(bundle.indexOf('function ub('), bundle.indexOf('function eu('));
const serialize = vm.runInNewContext(`(${serializer})`, {
  $e: JSON.stringify,
  ot: (value) => value,
  Wo: (_, value) => (typeof value === 'object' && value ? value.id : value),
});
const createStart = bundle.indexOf('function uS(');
const createEnd = bundle.indexOf('const hf=', createStart);
const serializeCreate = vm.runInNewContext(`(${bundle.slice(createStart, createEnd)})`, {
  iu: [{ name: 'Rectification' }],
  Gg: () => [{ name: 'Rectification_ID_Project', type: 'lookup' }],
  ts: (row) => row.values.Rectification_ID_Project.rectification,
});
const section = { name: 'Rectification', fields: [{ name: 'Rectification_ID_Project' }] };
for (const gsp of ['GSP-11', '', undefined]) {
  const option = {
    id: '123',
    rectification: {
      parentId: '124',
      type: 'Hardware',
      productLine: { id: '125' },
      ...(gsp !== undefined ? { gspNumber: gsp } : {}),
    },
  };
  const payload = serialize(
    { values: {}, sections: { Rectification: [] } },
    {
      values: {},
      sections: { Rectification: [{ key: 'new', values: { Rectification_ID_Project: option } }] },
    },
    [],
    [section],
  );
  assert.equal(payload.Rectification[0].Rectification_ID_Project, '123');
  assert.equal(payload.Rectification[0].GSP_Number, gsp);
  assert.equal(Object.hasOwn(payload.Rectification[0], 'GSP_Number'), gsp !== undefined);
  const created = serializeCreate({
    Rectification: [{ values: { Rectification_ID_Project: option } }],
  });
  assert.equal(created.Rectification[0].GSP_Number, gsp);
  assert.equal(Object.hasOwn(created.Rectification[0], 'GSP_Number'), gsp !== undefined);
}
const readOnlyStart = bundle.indexOf('readOnly:F.name==="Service_Tickets"&&', editor) + 9;
const readOnlyEnd = bundle.indexOf(',field:', readOnlyStart);
for (const id of ['saved-row', undefined]) {
  assert.equal(
    vm.runInNewContext(bundle.slice(readOnlyStart, readOnlyEnd), {
      F: { name: 'Service_Tickets' },
      Ae: { name: 'Staff' },
      be: { id, values: {} },
    }),
    !!id,
  );
}
assert.throws(() => patchProjectWorkflow(bundle), /did not match/);
console.log('Packaged workflow checks passed: 40 edit visibility combinations and GSP payloads.');

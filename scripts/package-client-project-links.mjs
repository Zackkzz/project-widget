import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build as buildRuntime } from 'esbuild';
import { patchRecordCache } from './patch-record-cache.mjs';
import { patchProjectWorkflow } from './patch-project-workflow.mjs';
import { patchColumnSettings } from './patch-column-settings.mjs';
import { patchClientDetailOrder } from './patch-client-detail-order.mjs';
import { patchPoDisplay } from './patch-po-display.mjs';
import { patchIssueDescription } from './patch-issue-description.mjs';

// The November 9 build has the detail dialogs. The current source checkout predates them.
const originalBundle = 'widget-DwtEDLVK.js';
const updatedBundle = 'widget-client-project-links.js';
const build = resolve(process.argv[2] ?? 'dist');
const output = resolve('artifacts/project-widget.zip');
const scratch = await mkdtemp(join(tmpdir(), 'project-client-links-'));
let bundle;

function replaceOnce(before, after) {
  const first = bundle.indexOf(before);
  if (first < 0 || bundle.indexOf(before, first + before.length) >= 0)
    throw new Error('The bundle does not match the November 9 Project widget build.');
  bundle = bundle.slice(0, first) + after + bundle.slice(first + before.length);
}

try {
  bundle = await readFile(join(build, 'app/assets', originalBundle), 'utf8');

  // History remains in the fetched record but is not exposed as an editable BOM field.
  replaceOnce(
    'record:du,fields:dn?Ii:ef,sections:dn?kg:Fj',
    'record:du,fields:dn?Ii.filter(field=>field.name!=="History"):ef,sections:dn?kg:Fj',
  );

  // Missing BOM display values use the shared blank-cell treatment; null stays distinct.
  replaceOnce(
    'An.fields.map(b=>r.jsx("td",{children:r.jsx(tu,{raw:y.raw[b.name]})},b.name))',
    'An.fields.map(b=>r.jsx("td",{children:r.jsx(tu,{raw:y.raw[b.name]===void 0||typeof y.raw[b.name]==="string"&&!y.raw[b.name].trim()?"":y.raw[b.name]})},b.name))',
  );
  replaceOnce(
    'title:Fe(S)||void 0,children:r.jsx(tu,{raw:S})',
    'title:Fe(S)||void 0,children:r.jsx(tu,{raw:S===void 0||typeof S==="string"&&!S.trim()?"":S})',
  );
  const editorStart = bundle.indexOf('function Uj(');
  const editorEnd = bundle.indexOf('const qj=', editorStart);
  if (editorStart < 0 || editorEnd < 0) throw new Error('BOM editor boundaries did not match.');
  const editor = bundle.slice(editorStart, editorEnd);
  const emptyDisplay = 'r.jsx(Ca,{})';
  if (editor.split(emptyDisplay).length - 1 !== 5)
    throw new Error('BOM stack display placeholders did not match.');
  bundle =
    bundle.slice(0, editorStart) +
    editor.replaceAll(emptyDisplay, 'r.jsx(tu,{raw:""})') +
    bundle.slice(editorEnd);
  replaceOnce(
    'className:"button secondary small",disabled:c,onClick:()=>o(y),children:"Edit BOM item"',
    'className:"button secondary small",style:{width:32,height:32,padding:0},disabled:c,"aria-label":"Edit BOM item","data-icon-label":"Edit BOM item",onClick:()=>o(y),children:r.jsx(Kp,{size:16,"aria-hidden":"true"})',
  );

  // Keep loading feedback inside the control it describes, rather than beside toolbar icons.
  replaceOnce(
    '"aria-label":"Saved project filters",value:(fe==null?void 0:fe.id)??(ee?"all":"current"),disabled:x,',
    '"aria-label":"Saved project filters","aria-busy":y,value:y?"loading":(fe==null?void 0:fe.id)??(ee?"all":"current"),disabled:x||y,',
  );
  replaceOnce(
    'children:[r.jsx("option",{value:"all",children:"All projects"}),!fe&&!ee',
    'children:[y&&r.jsx("option",{value:"loading",children:"Loading saved filters…"}),r.jsx("option",{value:"all",children:"All projects"}),!fe&&!ee',
  );
  replaceOnce(
    'y&&r.jsx("span",{className:"hint",role:"status",children:"Loading saved filters…"}),',
    '',
  );

  // Closing with Escape still restores focus; submitting with Enter simply closes the panel.
  replaceOnce(
    'function w(){var D;y(!1),(D=_.current)==null||D.focus()}function T(D,L)',
    'function w(restoreFocus=true){var D;y(!1),restoreFocus!==false&&((D=_.current)==null||D.focus())}function T(D,L)',
  );
  replaceOnce(
    'function M(){if(b.criteria.some(D=>["empty","notEmpty"].includes(D.operator)?!1:!nb(D.field,D.value))){p("Enter a valid value for each condition, or remove the unused row.");return}o({...b,criteria:b.criteria.map(D=>({...D,value:D.value.trim()}))}),w()}',
    'function M(restoreFocus=true){if(b.criteria.some(D=>["empty","notEmpty"].includes(D.operator)?!1:!nb(D.field,D.value))){p("Enter a valid value for each condition, or remove the unused row.");return}o({...b,criteria:b.criteria.map(D=>({...D,value:D.value.trim()}))}),w(restoreFocus)}',
  );

  // Apply typed criteria with Enter while leaving dropdown selection and IME input intact.
  replaceOnce(
    'id:"project-filter-panel",className:"project-filter-panel","aria-label":"Project filters",children:',
    `id:"project-filter-panel",className:"project-filter-panel","aria-label":"Project filters",
    onKeyDown:event=>{
      if (event.key !== "Enter" || event.defaultPrevented || event.repeat ||
          event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
          !event.currentTarget.contains(event.target) ||
          !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      event.stopPropagation();
      M(false);
    },children:`,
  );

  // These aliases are the original build's SDK, report reader, record reader, and ID validator.
  replaceOnce(
    'async related(_,g){if(_==="PO")',
    `
    async clientProjects(clientId) {
      const criteria = "Client == " + ot(clientId);
      const projects = new Map();
      const seenCursors = new Set();
      let cursor;
      do {
        const page = await xa(l, {
          report_name: La,
          field_config: "custom",
          fields: "Project_Name",
          criteria,
          max_records: 200,
          ...(cursor ? { record_cursor: cursor } : {}),
        });
        for (const project of page.rows) {
          const id = ot(project.ID);
          projects.set(id, {
            ID: id,
            zc_display_value: ze(project.Project_Name) || "Untitled project",
          });
        }
        cursor = page.cursor;
        if (cursor && seenCursors.has(cursor)) throw new Error("Zoho repeated a project page.");
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
      return [...projects.values()].sort((left, right) =>
        left.zc_display_value.localeCompare(right.zc_display_value)
      );
    },
    async related(_,g){if(_==="Project")return m(La,g);if(_==="PO")`,
  );
  replaceOnce(
    'async relatedLabels(_){if(!["Client","Project_Manager","PO"].includes(_))',
    'async relatedLabels(_){if(!["Client","Project_Manager","PO","Project"].includes(_))',
  );
  replaceOnce(
    'function ol({name:l,value:o,api:c,depth:u=0,inheritedLabels:d={},empty:m="—"})',
    'function ol({name:l,value:o,api:c,depth:u=0,inheritedLabels:d={},empty:m="—",clientProject=false})',
  );
  replaceOnce(
    'if(!(vj.has(l)&&o!==null&&typeof o=="object"))',
    'if(!((vj.has(l)||(clientProject&&l==="Project"&&_e(o).ID))&&o!==null&&typeof o=="object"))',
  );
  replaceOnce(
    'L&&_(L.raw)}catch(L){N(we(L))}',
    `
    if (L) {
      const details = L.raw;
      _(details);
      if (l === "Client" && c.clientProjects) {
        try {
          const projects = await c.clientProjects(String(M));
          const { Project: project, Projects: previousProjects, ...clientFields } = details;
          _({ ...clientFields, Projects: projects });
        } catch {
          N("Linked projects could not be loaded.");
        }
      }
    }
    }catch(L){N(we(L))}`,
  );
  replaceOnce(
    'children:(l==="PO"?Fe(_e(o).PO_Number):"")||Fe(o)',
    'children:(l==="PO"?Fe(_e(o).PO_Number):l==="Project"?Fe(_e(o).Project_Name):"")||Fe(o)',
  );

  const nestedProject = '(l==="Client"||l==="Project_Manager")&&(L==="Project"||L==="Projects")';
  for (const value of ['$', 'k']) {
    replaceOnce(
      `r.jsx(ol,{name:L,value:${value},api:c,depth:u+1,inheritedLabels:{...d,...f}})`,
      `r.jsx(ol,{name:${nestedProject}?"Project":L,value:${value},api:c,depth:u+1,inheritedLabels:{...d,...f},clientProject:${nestedProject}})`,
    );
  }
  replaceOnce(
    'children:Array.isArray(k)?k.map',
    `children:${nestedProject}&&Array.isArray(k)&&!k.length?"No linked projects":Array.isArray(k)?k.map`,
  );

  // Reuse the widget's normal detail/editor navigation, including its save and permission handling.
  replaceOnce(
    'C.useEffect(()=>{var M;x&&((M=w.current)==null||M.showModal())},[x]),Tb(o)',
    `C.useEffect(()=>{var M;x&&((M=w.current)==null||M.showModal())},[x]),
    C.useEffect(()=>{
      const closeRelated = () => S(false);
      window.addEventListener("widget:open-client-project", closeRelated);
      return () => window.removeEventListener("widget:open-client-project", closeRelated);
    },[]),Tb(o)`,
  );
  replaceOnce(
    'children:[r.jsx("h2",{children:Zd(l)}),r.jsx("button",{className:"button secondary related-record-close"',
    `children:[r.jsx("h2",{children:Zd(l)}),
      l==="Project"&&clientProject&&r.jsx("div",{className:"record-actions",style:{marginLeft:"auto",gap:8},children:
        [ ["detail","View project"], ["edit","Edit project"] ].map(([mode,label])=>
          r.jsx("button",{type:"button",className:"button secondary related-record-close",disabled:v,
            "aria-label":label,"data-icon-label":label,
            onClick:()=>window.dispatchEvent(new CustomEvent("widget:open-client-project",{
              detail:{id:String(_e(o).ID),mode}
            })),children:r.jsx(mode==="edit"?Kp:qg,{size:18,"aria-hidden":"true"})},mode)
        )
      }),r.jsx("button",{className:"button secondary related-record-close"`,
  );
  replaceOnce(
    'r.jsxs("header",{children:[r.jsx("h2",{children:Zd(l)})',
    'r.jsxs("header",{style:l==="Project"&&clientProject?{gap:8}:void 0,children:[r.jsx("h2",{children:Zd(l)})',
  );
  replaceOnce(
    'C.useEffect(()=>{o&&d&&Pa(o)},[o,d]);async function mn()',
    `C.useEffect(()=>{o&&d&&Pa(o)},[o,d]);
    C.useEffect(()=>{
      const openClientProject = event => {
        const request = event.detail;
        if (!d || !request || !request.id) return;
        if (request.mode === "edit") void yn({id:request.id});
        else void Pa(request.id);
      };
      window.addEventListener("widget:open-client-project",openClientProject);
      return () => window.removeEventListener("widget:open-client-project",openClientProject);
    },[d]);async function mn()`,
  );

  bundle = patchProjectWorkflow(bundle);
  bundle = patchRecordCache(bundle);
  bundle = patchColumnSettings(bundle);
  bundle = patchClientDetailOrder(bundle);
  bundle = patchPoDisplay(bundle);
  bundle = patchIssueDescription(bundle);
  await cp(join(build, 'app'), join(scratch, 'app'), { recursive: true });
  await buildRuntime({
    entryPoints: [resolve('app/src/cache/projectCache.ts')],
    outfile: join(scratch, 'app/assets/project-record-cache.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
  });
  await cp(resolve('plugin-manifest.json'), join(scratch, 'plugin-manifest.json'));
  const loadingStyles = `
    .saved-filters > .app-select { width: 240px; max-width: 100%; }
    .saved-filters [aria-busy="true"] { opacity: 1; color: var(--type-secondary); }
    .editor-loading-status { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--type-secondary); }
  `;
  await writeFile(
    join(scratch, 'app/assets/widget-refinements.css'),
    loadingStyles +
      (await readFile(resolve('app/src/poDisplay.css'), 'utf8')) +
      (await readFile(resolve('app/src/components/subforms/foldedText.css'), 'utf8')) +
      (await readFile(resolve('app/src/cache/recovery.css'), 'utf8')) +
      (await readFile(resolve('app/src/components/columns/columnSettings.css'), 'utf8')),
  );
  await cp(resolve('app/assets/conflict-recovery'), join(scratch, 'app/assets/conflict-recovery'), {
    recursive: true,
  });
  await cp(resolve('app/assets/column-settings'), join(scratch, 'app/assets/column-settings'), {
    recursive: true,
  });
  await writeFile(join(scratch, 'app/assets', updatedBundle), bundle);
  await rm(join(scratch, 'app/assets', originalBundle));
  const entryPath = join(scratch, 'app/widget.html');
  const entry = await readFile(entryPath, 'utf8');
  if (!entry.includes(originalBundle)) throw new Error('The widget entry points to another build.');
  await writeFile(
    entryPath,
    entry
      .replace(originalBundle, updatedBundle)
      .replace('</head>', '<link rel="stylesheet" href="./assets/widget-refinements.css"></head>'),
  );

  const archive = join(scratch, 'widget.zip');
  execFileSync('zip', ['-qr', archive, 'app', 'plugin-manifest.json'], { cwd: scratch });
  await mkdir(resolve('artifacts'), { recursive: true });
  await rename(archive, output);
  console.log('Packaged artifacts/project-widget.zip (entry /app/widget.html)');
} finally {
  await rm(scratch, { recursive: true, force: true });
}

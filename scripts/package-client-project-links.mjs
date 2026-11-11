import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
      M();
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

  await cp(join(build, 'app'), join(scratch, 'app'), { recursive: true });
  await cp(resolve('plugin-manifest.json'), join(scratch, 'plugin-manifest.json'));
  await writeFile(join(scratch, 'app/assets', updatedBundle), bundle);
  await rm(join(scratch, 'app/assets', originalBundle));
  const entryPath = join(scratch, 'app/widget.html');
  const entry = await readFile(entryPath, 'utf8');
  if (!entry.includes(originalBundle)) throw new Error('The widget entry points to another build.');
  await writeFile(entryPath, entry.replace(originalBundle, updatedBundle));

  const archive = join(scratch, 'widget.zip');
  execFileSync('zip', ['-qr', archive, 'app', 'plugin-manifest.json'], { cwd: scratch });
  await mkdir(resolve('artifacts'), { recursive: true });
  await rename(archive, output);
  console.log('Packaged artifacts/project-widget.zip (entry /app/widget.html)');
} finally {
  await rm(scratch, { recursive: true, force: true });
}

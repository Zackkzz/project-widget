import { patchDraftRecovery } from './patch-draft-recovery.mjs';
/** Connects the readable cache modules to the preserved November 9 editor build. */
export function patchRecordCache(bundle) {
  function replaceOnce(before, after) {
    const first = bundle.indexOf(before);
    if (first < 0 || bundle.indexOf(before, first + before.length) >= 0)
      throw new Error(`Record-cache build anchor did not match: ${before.slice(0, 90)}`);
    bundle = bundle.slice(0, first) + after + bundle.slice(first + before.length);
  }

  bundle =
    'import { createProjectCacheRuntime, mapConcurrent, hydrateMissingFields } from "./project-record-cache.js";\n' +
    bundle;
  // Reference caching is user-scoped; save-time permission checks deliberately bypass it.
  replaceOnce(
    'async function u(y,b,x){return(await xa(o,{report_name:y,',
    'async function u(y,b,x,fresh=false){return(await xa(fresh?o:recordCache.sdk,{report_name:y,',
  );
  replaceOnce(
    'async function f(){if(typeof c.loginUser',
    'async function f(fresh=false){if(typeof c.loginUser',
  );
  replaceOnce(
    'await u("Staff_List","Permissions",`User_name == ${on(c.loginUser)}`)',
    'await u("Staff_List","Permissions",`User_name == ${on(c.loginUser)}`,fresh)',
  );
  replaceOnce(
    '!await(c==null?void 0:c()))throw new ue("Only project admins',
    '!await(c==null?void 0:c(true)))throw new ue("Only project admins',
  );
  replaceOnce(
    'return{mode:"live",relatedForms:hS(o,c.loginUser),records:qS(o,m,f),',
    `const recordCache = createProjectCacheRuntime(o, {
      user:c.loginUser,app:c.appLinkName||"sungrowauservice"
    },Ii.filter(field=>field.name!=="History").map(field=>field.name));
    return{mode:"live",relatedForms:hS(o,c.loginUser),records:recordCache.attach(
      qS(recordCache.sdk,m,f,recordCache.hydrateSubformFields),qS(recordCache.backgroundSdk,m,f,recordCache.hydrateSubformFields)
    ),`,
  );
  replaceOnce('$S().then(V=>{Z&&c(V)})', '$S().then(V=>{Z?c(V):V.records?.disposeCache?.()})');

  replaceOnce('function qS(l,o,c){', 'function qS(l,o,c,hydrateRow=hydrateMissingFields){');
  replaceOnce('const j=await y(_,g.id);', 'const j=await y(_,g.id,true);');
  const milestoneStart = bundle.indexOf('async function f(_){const g=[];');
  const milestoneEnd = bundle.indexOf('async function y(_,g)', milestoneStart);
  if (milestoneStart < 0 || milestoneEnd < 0)
    throw new Error('Milestone metadata helper boundaries did not match');
  replaceOnce(
    bundle.slice(milestoneStart, milestoneEnd),
    `async function f(rows,projectId){
    return mapConcurrent(rows,async row=>{
      try{return await hydrateRow(_e(row),ns.map(field=>field.name),async(id,missing)=>(await m("Milestones",ot(id),missing.join(","))).raw,{report:"Milestones",projectId});}
      catch{return row;}
    });
  }`,
  );
  replaceOnce('return f(g.Milestone_Tracker)', 'return f(g.Milestone_Tracker,_)');

  // A single-record response can include extra fields absent from its full report-list row.
  // Check every baseline field for changes, without treating newly exposed fields as conflicts.
  replaceOnce(
    'if($e(j.raw)!==$e(g.raw))throw new ue("This record changed after you opened it.',
    'if($e(_===Po&&g.reportBaseline?Object.fromEntries(Object.keys(g.raw).map(key=>[key,j.raw[key]])):j.raw)!==$e(g.raw))throw new ue("This record changed after you opened it.',
  );

  // The original hydration loop awaited every PO/ticket/issue row sequentially.
  const hydrationStart = bundle.indexOf('async function y(_,g){const N=await m(_,g);');
  const hydrationEnd = bundle.indexOf('async function b(_,g,N){', hydrationStart);
  if (hydrationStart < 0 || hydrationEnd < 0)
    throw new Error('Project hydration function did not match the preserved build.');
  const originalHydration = bundle.slice(hydrationStart, hydrationEnd);
  replaceOnce(
    originalHydration,
    `async function y(report,id,fresh=false) {
      const record = await m(report,id);
      if(report!==La) return record;
      const reports={...US,PO:"PO_Record",Service_Tickets:"Service_Ticket_List",Issue_Register:"Issue_Registers",Milestone_Tracker:"Milestones"};
      await Promise.all(Object.entries(reports).map(async([section,relatedReport])=>{
        if(!Array.isArray(record.raw[section])) return;
        const fields=(section==="Milestone_Tracker"?ns:pt.find(item=>item.name===section)?.fields??[]).map(field=>field.name);
        record.raw[section]=await mapConcurrent(record.raw[section],async row=>{
          const existing=_e(row);
          try {
            return await (fresh?hydrateMissingFields:hydrateRow)(existing,fields,async(rowId,missing)=>(await m(relatedReport,ot(rowId),missing.join(","))).raw,{report:relatedReport,projectId:record.id,revision:record.raw.Modified_Time});
          } catch(error) {
            if(section==="PO"||section==="Service_Tickets") throw error;
            return existing;
          }
        });
      }));
      return record;
    }`,
  );

  replaceOnce(
    'getBom:_=>y(Po,_),updateBom:',
    `async getBomFields(id,fields){
      try{return await m(Po,id,fields.join(","));}
      catch(error){if(String(error.message).includes("None of the fields supplied"))return {id,raw:{ID:id}};throw error;}
    },getBom:_=>y(Po,_),updateBom:`,
  );

  const displayStart = bundle.indexOf('async readOnlySectionRows(_){');
  const displayEnd = bundle.indexOf('update:(_,g)=>b(La,_,g)', displayStart);
  if (displayStart < 0 || displayEnd < 0)
    throw new Error('Subform display hydration boundaries did not match.');
  replaceOnce(
    bundle.slice(displayStart, displayEnd),
    `async readOnlySectionRows(record){
    const result={};
    await Promise.all(pt.map(async section=>{
      const report=US[section.name];
      if(!report||!Array.isArray(record.raw[section.name])) return;
      await mapConcurrent(record.raw[section.name],async row=>{
        const existing=_e(row),fields=section.fields.map(field=>field.name);
        if(fields.every(field=>Object.hasOwn(existing,field))) return;
        try {
          const hydrated=await hydrateRow(existing,fields,async(id,missing)=>(await m(report,ot(id),missing.join(","))).raw,{report,projectId:record.id,revision:record.raw.Modified_Time});
          if(hydrated!==existing) (result[section.name]??={})[existing.ID]=hydrated;
        } catch {}
      });
    }));
    return result;
  },`,
  );

  replaceOnce(
    'const d=l.records,[m,f]=C.useState([])',
    `const d=l.records,
    [editorLoading,setEditorLoading]=C.useState(false),
    [editorLoadError,setEditorLoadError]=C.useState(""),
    [editorRevision,setEditorRevision]=C.useState(0),
    editorToken=C.useRef(0),
    [m,f]=C.useState([])`,
  );
  replaceOnce(
    'async function yn(B,J=!1){if(!d)return;const ye=Zt.current;Et(""),vt(!0);try{const Oe=J?await d.getBom(B.id):await d.get(B.id),qe=J?[]:await cj(d,B.id);vf(Oe,J?Ii:ef,J?kg:pt),fa.current&&ye===Zt.current&&(f(qe),cl(Oe),cu(J))}catch(Oe){fa.current&&Et(we(Oe))}finally{fa.current&&vt(!1)}}',
    `async function yn(record,isBom=false) {
      if(!d) return;
      const token=++editorToken.current;
      let finished=false;
      const cached=isBom?undefined:d.peekEditor?.(record.id);
      const placeholder={id:record.id,raw:{Project_Name:ze(record.raw?.Project_Name)||"Project"}};
      Et("");vt(false);cu(isBom);setEditorLoading(true);setEditorLoadError("");
      f(cached?.bom??[]);cl(cached?.record??(record.raw?record:placeholder));
      setEditorRevision(value=>value+1);
      if(!isBom&&d.cachedEditor) void d.cachedEditor(record.id).then(snapshot=>{
        if(snapshot?.record&&!finished&&fa.current&&token===editorToken.current){
          f(snapshot.bom??[]);cl(snapshot.record);setEditorRevision(value=>value+1);
        }
      }).catch(()=>{});
      try {
        const loaded=d.prepareEditor?await d.prepareEditor(record.id,isBom):{
          record:isBom?await d.getBom(record.id):await d.get(record.id),
          bom:isBom?[]:await cj(d,record.id)
        };
        vf(loaded.record,isBom?Ii:ef,isBom?kg:pt);
        if(fa.current&&token===editorToken.current){
          f(loaded.bom);cl(loaded.record);setEditorRevision(value=>value+1);
        }
      } catch(error){
        if(fa.current&&token===editorToken.current){
          f([]);cl(placeholder);setEditorLoadError(we(error));setEditorRevision(value=>value+1);
        }
      } finally {
        finished=true;
        if(fa.current&&token===editorToken.current) setEditorLoading(false);
      }
    }`,
  );
  replaceOnce(
    'async function cs(B){if(cl(null),',
    'async function cs(B){editorToken.current++;setEditorLoading(false);setEditorLoadError("");if(cl(null),',
  );
  replaceOnce(
    'if(ft)return r.jsx(Qj,{gateway:l,record:du,',
    'if(ft)return r.jsx(Qj,{gateway:l,record:du,loading:editorLoading,loadError:editorLoadError,retryLoad:()=>void yn(ft,dn),',
  );
  replaceOnce(
    'close:B=>void cs(B),onMilestonesChange:Ft,onNavigationState:c},ft.id)',
    'close:B=>void cs(B),onMilestonesChange:Ft,onNavigationState:c},ft.id+":"+editorRevision)',
  );
  replaceOnce(
    'function Qj({gateway:l,record:o,fields:c,sections:u,title:d,save:m,close:f,onNavigationState:y,onMilestonesChange:b})',
    'function Qj({gateway:l,record:o,fields:c,sections:u,title:d,save:m,close:f,onNavigationState:y,onMilestonesChange:b,loading=false,loadError="",retryLoad})',
  );
  replaceOnce(
    'if(!Object.hasOwn(x.values,"Project_ID"))return;',
    'if(loading||loadError||!Object.hasOwn(x.values,"Project_ID"))return;',
  );
  replaceOnce(
    'C.useEffect(()=>{var be,Ee;let F=!0;return v({}),u.length&&',
    'C.useEffect(()=>{var be,Ee;let F=!0;return v({}),!loading&&!loadError&&u.length&&',
  );
  replaceOnce(
    'async function tt(){if(P.current||M||$||L)return;',
    'async function tt(){if(loading||loadError||P.current||M||$||L)return;',
  );
  replaceOnce(
    'className:"form-fields",disabled:M||$,',
    'className:"form-fields",disabled:loading||!!loadError||M||$,',
  );
  replaceOnce(
    'disabled:!V||M||$||L,children:[M?',
    'disabled:loading||!!loadError||!V||M||$||L,children:[M?',
  );
  replaceOnce(
    'r.jsx(Vj,{record:o,gateway:l,onRows:b,onSaving:D,onPendingChanges:k,visible:au("Milestone_Tracker",Se,xt)||L})',
    '!loading&&!loadError&&r.jsx(Vj,{record:o,gateway:l,onRows:b,onSaving:D,onPendingChanges:k,visible:au("Milestone_Tracker",Se,xt)||L})',
  );
  replaceOnce(
    'const xt=o.raw.Warranty_Tickets;return r.jsxs("div",{className:"record-editor",children:[',
    `const xt=o.raw.Warranty_Tickets;return r.jsxs("div",{className:"record-editor","aria-busy":loading,children:[
      loading&&r.jsxs("div",{className:"editor-loading-status",role:"status",children:[
        r.jsx(Yi,{size:16,className:"spin","aria-hidden":"true"}),"Verifying project data…"
      ]}),
      loadError&&r.jsxs("div",{className:"submission-error",role:"alert",children:[
        r.jsx("p",{children:loadError}),r.jsx("button",{type:"button",className:"button secondary small",onClick:retryLoad,children:"Retry loading"})
      ]}),`,
  );
  // Hover/focus raises priority for a likely next project without changing row click behaviour.
  replaceOnce(
    'B.records).map((J,ye)=>r.jsxs("tr",{children:[',
    'B.records).map((J,ye)=>r.jsxs("tr",{"data-project-id":J.id,children:[',
  );

  return patchDraftRecovery(bundle);
}

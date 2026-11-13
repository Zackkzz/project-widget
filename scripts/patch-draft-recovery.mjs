/** Adds local draft restoration and field-level refresh recovery to the preserved editor. */
export function patchDraftRecovery(bundle) {
  const replace = (before, after) => {
    const index = bundle.indexOf(before);
    if (index < 0 || bundle.indexOf(before, index + before.length) >= 0)
      throw new Error(`Draft recovery anchor did not match: ${before.slice(0, 100)}`);
    bundle = bundle.slice(0, index) + after + bundle.slice(index + before.length);
  };
  replace(
    'createProjectCacheRuntime, mapConcurrent, hydrateMissingFields }',
    'createProjectCacheRuntime, mapConcurrent, hydrateMissingFields, mergeEditorDraft, recoveryPanel }',
  );
  replace('function Qj({gateway:l,record:o,', 'function Qj({gateway:l,record:initialRecord,');
  replace(
    'title:d,save:m,close:f,onNavigationState:y,onMilestonesChange:b,loading=',
    'title:d,save:m,close:onClose,onNavigationState:y,onMilestonesChange:b,loading=',
  );
  replace(
    'const x=C.useMemo(()=>vf(o,c,u),[o,c,u]),[S,p]=C.useState(x),',
    `const [o,setActiveRecord]=C.useState(initialRecord),
    [x,setBaseline]=C.useState(()=>vf(initialRecord,c,u)),[S,p]=C.useState(x),
    [draftReady,setDraftReady]=C.useState(false),
    [recoveryBusy,setRecoveryBusy]=C.useState(false),
    [recoveryMessage,setRecoveryMessage]=C.useState(""),
    [recoveryConflicts,setRecoveryConflicts]=C.useState([]),
    [recoveryAllConflicts,setRecoveryAllConflicts]=C.useState([]),
    [recoveryOpen,setRecoveryOpen]=C.useState(false),
    [recoveryReady,setRecoveryReady]=C.useState(false),
    [recoveryChoices,setRecoveryChoices]=C.useState({}),
    [automaticMergeCount,setAutomaticMergeCount]=C.useState(0),
    [recoveryOrigin,setRecoveryOrigin]=C.useState(null),
    recoveryBaseline=C.useRef(null),draftWrite=C.useRef(0),
    `,
  );
  replace(
    'const[j,w]=C.useState({}),[T,A]=C.useState(""),',
    `
    function rebaseDraft(origin,latest,keepOrigin=false) {
      const merged=mergeEditorDraft(origin.base,origin.draft,latest,origin.choices);
      p(merged.draft);setRecoveryConflicts(merged.conflicts);
      setRecoveryAllConflicts(mergeEditorDraft(origin.base,origin.draft,latest).conflicts);
      setRecoveryChoices(origin.choices);setAutomaticMergeCount(merged.automaticCount);
      setRecoveryOrigin(merged.conflicts.length||keepOrigin?origin:null);
      return merged;
    }
    C.useEffect(()=>{
      if(loading||loadError) return;
      let active=true;
      Promise.resolve(l.records?.loadDraft?.(o.id)).then(saved=>{
        if(!active) return;
        if(saved){
          if(saved.uncertain) K(true);
          const origin=saved.recovery?{...saved.recovery,choices:{}}:{base:saved.base,draft:saved.draft,choices:{}};
          const merged=rebaseDraft(origin,x);
          setRecoveryReady(!merged.conflicts.length);
          setRecoveryMessage(saved.uncertain?"Your draft is restored. Some updates may already have saved; saving remains disabled until those updates are checked.":saved.missingFiles?"Your fields were restored. Reattach files that could not be stored in this browser.":merged.conflicts.length?"Your draft is restored. Choose a value for each field changed in both versions.":"Your unsaved changes were restored against the latest saved data.");
        }
        setDraftReady(true);
      }).catch(()=>{if(active){setDraftReady(true);setRecoveryMessage("Local draft storage is unavailable. Keep this editor open until you save.");}});
      return()=>{active=false;};
    },[l,initialRecord.id,loading,loadError]);
    C.useEffect(()=>{
      if(!draftReady||loading||loadError) return;
      const version=++draftWrite.current;
      if($e(x)===$e(S)&&!recoveryConflicts.length){void l.records?.clearDraft?.(o.id);return;}
      void l.records?.saveDraft?.({id:o.id,isBom:c===Ii,base:x,draft:S,recovery:recoveryOrigin??undefined,uncertain:$}).then(saved=>{
        if(!saved&&version===draftWrite.current&&W.current)
          setRecoveryMessage("Your draft is kept in this editor, but browser storage is unavailable or full. Keep it open until you save.");
      });
    },[S,x,draftReady,loading,loadError,recoveryOrigin,recoveryConflicts.length]);
    C.useEffect(()=>{
      if(recoveryOrigin&&!recoveryOpen){
        const origin={...recoveryOrigin,draft:S,choices:{}};
        setRecoveryOrigin(origin);
        setRecoveryConflicts(mergeEditorDraft(origin.base,S,x).conflicts);
      }
    },[S,recoveryOpen]);
    async function f(saved){
      draftWrite.current++;
      await l.records?.clearDraft?.(o.id);
      onClose(saved);
    }
    async function refreshKeepingDraft(){
      if(recoveryBusy||M||L) return;
      setRecoveryBusy(true);setRecoveryReady(false);A("");fe(false);
      const origin=recoveryOrigin??{base:x,draft:S,choices:{}};
      try{
        const loaded=await l.records.prepareEditor(o.id,c===Ii);
        if(!W.current) return;
        const record=c===Ii?loaded.record:{...loaded.record,raw:{...loaded.record.raw,BOM:loaded.bom.map(row=>row.raw)}};
        const baseline=vf(record,c,u);
        recoveryBaseline.current=loaded;setActiveRecord(record);setBaseline(baseline);
        const merged=rebaseDraft({...origin,choices:{}},baseline);
        setRecoveryOpen(merged.conflicts.length>0);setRecoveryReady(!merged.conflicts.length);w({});
        setRecoveryMessage($?"Latest data loaded. Your draft is kept, but some updates may already have saved. Saving remains disabled until those updates are checked.":merged.conflicts.length?"Your changes are kept. Choose a value for each field changed in both versions.":"Latest data loaded. Your changes are kept; review them before saving.");
      }catch(error){if(W.current) A(we(error));}
      finally{if(W.current)setRecoveryBusy(false);}
    }
    function resolveRecovery(key,choice){
      if(!recoveryOrigin) return;
      const origin={...recoveryOrigin,choices:{...recoveryOrigin.choices,[key]:choice}};
      rebaseDraft(origin,x,true);
    }
    function reviewRecovery(){
      if(recoveryReady){fe(true);return;}
      if(recoveryOrigin){
        rebaseDraft(recoveryOrigin,x,true);setRecoveryOpen(true);return;
      }
      void refreshKeepingDraft();
    }
    function finishRecovery(){
      if(recoveryConflicts.length) return;
      setRecoveryOpen(false);setRecoveryOrigin(null);setRecoveryReady(true);fe(true);
      setRecoveryMessage("Your changes are ready to save. Nothing is saved until you confirm.");
    }
    function recoveryLabel(conflict){
      const path=conflict.path;
      if(path[0]==="values") return c.find(field=>field.name===path[1])?.label??path[1];
      const section=u.find(item=>item.name===path[1]);
      const rows=S.sections[path[1]]??[];
      const row=rows.findIndex(item=>(item.id||item.key)===path[2]);
      const entry=rows[row];const first=section?.fields[0]?.name;
      const candidate=entry?.values[first]??entry?.original[first];
      const rowLabel=candidate?.label??Fe(candidate);
      const field=section?.fields.find(item=>item.name===path[4]);
      return [section?.title??path[1],rowLabel||(row>=0?"row "+(row+1):""),field?.label].filter(Boolean).join(" · ");
    }
    const [j,w]=C.useState({}),[T,A]=C.useState(""),`,
  );
  replace(
    'V=ce.length>0||Z.length>0;',
    'V=ce.length>0||Z.length>0;C.useEffect(()=>{if($&&draftReady)void l.records?.saveDraft?.({id:o.id,isBom:c===Ii,base:x,draft:S,recovery:recoveryOrigin??undefined,uncertain:true})},[$,draftReady]);',
  );
  replace(
    'save:(B,J)=>dn?d.updateBom(ft,B):dj(d,ft,m,B,J)',
    'save:(B,J,baseline)=>dn?d.updateBom(baseline?.record??ft,B):dj(d,baseline?.record??ft,baseline?.bom??m,B,J)',
  );
  replace('Ee.length?await m(be,Ee):await m(be)', 'await m(be,Ee,recoveryBaseline.current)');
  replace(
    'if(loading||loadError||P.current||M||$||L)return;',
    'if(loading||loadError||!draftReady||recoveryBusy||recoveryOpen||!!recoveryOrigin||P.current||M||$||L)return;',
  );
  replace(
    'new ue("This record changed after you opened it. Close the editor and refresh the record before saving.")',
    'Object.assign(new ue("The record changed since you opened it. Your edits are kept."),{code:"RECORD_CONFLICT"})',
  );
  replace(
    'W.current&&(A(we(be)),be instanceof ue&&be.uncertain&&K(!0))',
    'W.current&&(A(be?.code==="RECORD_CONFLICT"?"":we(be)),setRecoveryMessage(be?.code==="RECORD_CONFLICT"?"This project changed while you were editing. Review the latest changes before saving.":"Your modified fields are kept. Resolve the error before retrying."),setRecoveryReady(false),fe(false),be instanceof ue&&be.uncertain&&K(!0))',
  );
  replace(
    'disabled:loading||!!loadError||M||$,',
    'disabled:loading||!!loadError||!draftReady||recoveryBusy||recoveryOpen||M||$,',
  );
  replace(
    'disabled:loading||!!loadError||!V||M||$||L,',
    'disabled:loading||!!loadError||!draftReady||recoveryBusy||recoveryOpen||!!recoveryOrigin||!V||M||$||L,',
  );
  replace(
    '"aria-busy":loading,children:[',
    '"aria-busy":loading||!draftReady||recoveryBusy,children:[',
  );
  replace(
    'loading&&r.jsxs("div",{className:"editor-loading-status"',
    '(loading||!draftReady)&&r.jsxs("div",{className:"editor-loading-status"',
  );
  replace(
    'r.jsxs("form",{noValidate:!0,onSubmit:F=>{F.preventDefault(),tt()},children:[',
    `
    (recoveryMessage||recoveryConflicts.length>0)&&recoveryPanel(C,{
      title:d,message:recoveryMessage,conflicts:recoveryAllConflicts,label:recoveryLabel,
      unresolved:recoveryConflicts.length,choices:recoveryChoices,automaticCount:automaticMergeCount,
      ready:recoveryReady,open:recoveryOpen,
      resolve:resolveRecovery,refresh:refreshKeepingDraft,review:reviewRecovery,
      closeReview:()=>setRecoveryOpen(false),finishReview:finishRecovery,busy:recoveryBusy||M||L
    }),
    r.jsxs("form",{noValidate:!0,onSubmit:F=>{F.preventDefault(),tt()},children:[`,
  );
  // A browser refresh returns to the list and offers restoration instead of silently opening an editor.
  replace(
    '[editorLoading,setEditorLoading]=C.useState(false),',
    `[pendingDraft,setPendingDraft]=C.useState(null),
    [editorLoading,setEditorLoading]=C.useState(false),`,
  );
  replace('editorToken=C.useRef(0),', `editorToken=C.useRef(0),`);
  replace(
    'async function yn(record,isBom=false) {',
    `C.useEffect(()=>{let active=true;void d?.latestDraft?.().then(saved=>{if(active)setPendingDraft(saved)});return()=>{active=false}},[d]);
    async function yn(record,isBom=false) {
      setPendingDraft(null);`,
  );
  replace(
    'className:"records-workspace",children:[',
    `className:"records-workspace",children:[
    pendingDraft&&r.jsxs("div",{className:"draft-restore-notice",role:"status",children:[
      r.jsx("span",{children:"Continue your previous edit? Your unsaved changes are kept on this device."}),
      r.jsx("button",{type:"button",className:"button secondary small",onClick:()=>void yn({id:pendingDraft.id},pendingDraft.isBom),children:"Restore draft"}),
      r.jsx("button",{type:"button",className:"button text small",onClick:()=>{void d.clearDraft(pendingDraft.id);setPendingDraft(null)},children:"Discard draft"})
    ]}),`,
  );
  return bundle;
}

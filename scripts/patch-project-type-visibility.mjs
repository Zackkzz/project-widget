/** Apply the Project Type input workflow to the preserved Projects UI. */
export function patchProjectTypeVisibility(input) {
  let bundle = input;
  function replace(before, after) {
    if (bundle.split(before).length !== 2) {
      throw new Error(`Project Type visibility patch did not match: ${before.slice(0, 100)}`);
    }
    bundle = bundle.replace(before, after);
  }

  replace(
    'function bb({value:l,change:o}){return r.jsxs("fieldset",{className:"bom-view-selector",children:[r.jsx("legend",{children:"BOM Display"}),["Detail View","Stack View","Batch Input"].map(c=>r.jsxs("label",{children:[r.jsx("input",{type:"radio",name:"bom-view",checked:l===c,onChange:()=>o(c)}),c]},c))]})}',
    `function bb({value,change}){
      const groupName=C.useId();
      return r.jsxs("fieldset",{className:"bom-view-selector bom-view-selector--segmented",children:[
        r.jsx("legend",{children:"BOM Display"}),
        r.jsx("div",{className:"bom-view-segments",children:["Detail View","Stack View","Batch Input"].map(mode=>
          r.jsxs("label",{children:[
            r.jsx("input",{type:"radio",name:groupName,value:mode,checked:value===mode,onChange:()=>change(mode)}),
            r.jsx("span",{children:mode})
          ]},mode))})
      ]});
    }`,
  );

  // On type input show the date for non-C&I projects. On EXW input use the EXW date rule.
  replace(
    'function JS({draft:l,errors:o,gateway:c,set:u})',
    'function JS({draft:l,errors:o,gateway:c,set:u,showEstimate})',
  );
  replace(
    'l.EXW_Factory_Date&&v("Estimated_Commission_Date"',
    'showEstimate&&v("Estimated_Commission_Date"',
  );
  replace(
    'l.EXW_Factory_Date&&S("Estimated_Commission_Date",l.Estimated_Commission_Date)',
    'S("Estimated_Commission_Date",l.Estimated_Commission_Date)',
  );
  replace(
    'l.EXW_Factory_Date&&(c("EXW_Factory_Date",aa(l.EXW_Factory_Date)),l.Estimated_Commission_Date&&c("Estimated_Commission_Date",aa(l.Estimated_Commission_Date)))',
    'l.EXW_Factory_Date&&c("EXW_Factory_Date",aa(l.EXW_Factory_Date)),l.Estimated_Commission_Date&&c("Estimated_Commission_Date",aa(l.Estimated_Commission_Date))',
  );
  replace(
    'function ae(Z,V){w||D||(N(I=>fS(I,Z,V))',
    `function ae(Z,V){w||D||(
      Z==="Project_Type"&&setCreateEstimateVisible(!na(V)),
      Z==="EXW_Factory_Date"&&setCreateEstimateVisible(!!V),
      N(I=>fS(I,Z,V))`,
  );
  replace(
    '[g,N]=C.useState(eg),[v,j]',
    `[g,N]=C.useState(eg),
    [createEstimateVisible,setCreateEstimateVisible]=C.useState(false),
    [milestones,setMilestones]=C.useState([]),[milestoneOpen,setMilestoneOpen]=C.useState(false),
    [milestoneError,setMilestoneError]=C.useState(""),[milestoneBlocked,setMilestoneBlocked]=C.useState(false),
    [v,j]`,
  );
  replace(
    'he&&(N(eg()),',
    'he&&(N(eg()),setCreateEstimateVisible(false),setMilestones([]),setMilestoneError(""),setMilestoneBlocked(false),',
  );
  replace(
    'async function De(){if(!o||W.current||D)return;const Z=Zg(g);',
    `async function saveCreatedMilestones(project, rows){
    let pending=rows;
    for(const row of rows){
      let id=row.id;
      try{
        id??=await o.records.createMilestoneDraft(row);
        await o.records.completeMilestone(project.id,id,Ag(row.signature));
        pending=pending.slice(1);
        setMilestones(pending);
      }catch(error){
        setMilestones([{...row,id},...pending.slice(1)]);
        setMilestoneBlocked(error instanceof ue&&error.uncertain&&!id);
        setMilestoneError(we(error));
        return;
      }
    }
    setMilestoneError("");
  }
  async function retryCreatedMilestones(){
    if(W.current||milestoneBlocked)return;
    W.current=true;T(true);
    try{await saveCreatedMilestones(k,milestones)}finally{W.current=false;T(false)}
  }
  async function De(){if(!o||W.current||D)return;
    const submission=createEstimateVisible?g:{...g,Estimated_Commission_Date:""};
    const Z=Zg(submission);`,
  );
  replace(
    'const V=await o.create(mS(g));$(V),P(!1)',
    `const V=await o.create(mS(submission));
    $(V);P(false);
    if(na(g.Project_Type)&&milestones.length)await saveCreatedMilestones(V,milestones);`,
  );
  replace(
    'className:"success-actions",children:[k&&',
    `className:"success-actions",children:[
    k&&milestoneError&&r.jsxs("div",{role:"alert",children:[
      r.jsx("p",{children:"Project created. Some milestones still need attention. "+milestoneError}),
      !milestoneBlocked&&r.jsx("button",{type:"button",className:"button secondary",disabled:w,onClick:retryCreatedMilestones,children:"Retry saving milestones"})
    ]}),k&&`,
  );
  replace(
    'className:"button primary",onClick:()=>{f(k.id),d("records")}',
    'className:"button primary",disabled:w,onClick:()=>{f(k.id),d("records")}',
  );
  replace(
    'className:"button secondary",onClick:le,children:"Start another project"',
    'className:"button secondary",disabled:w,onClick:le,children:"Start another project"',
  );
  replace(
    'children:r.jsx(JS,{draft:g,errors:v,gateway:o,set:ae})',
    `children:r.jsxs(r.Fragment,{children:[
      r.jsx(JS,{draft:g,errors:v,gateway:o,set:ae,showEstimate:createEstimateVisible}),
      na(g.Project_Type)&&r.jsxs(Sa,{title:"Milestone Tracker",children:[
        milestones.length>0&&r.jsx("ul",{children:milestones.map(row=>r.jsxs("li",{children:[
          row.milestone," · ",row.date," ",r.jsx("button",{type:"button",className:"button secondary small",
            onClick:()=>setMilestones(rows=>rows.filter(item=>item.key!==row.key)),children:"Remove milestone"})
        ]},row.key))}),
        r.jsx(ou,{label:"Add new milestone",opensDialog:true,onClick:()=>setMilestoneOpen(true),
          disabled:R!=="preview"&&!(o.records?.createMilestoneDraft&&o.records?.completeMilestone)}),
        milestoneOpen&&r.jsx(Qi,{label:"Add milestone",initial:()=>Pj,validateRow:row=>Mg(row),
          onApply:row=>setMilestones(rows=>[...rows,{...row,key:Qr()}]),onClose:()=>setMilestoneOpen(false),
          fields:(row,change,errors)=>r.jsxs("div",{className:"fields row-dialog-fields",children:[
            ...[[Nf,"milestone","name"],[Ef,"date","date"],[xf,"staff","staff"],[Cf,"partners","partners"]].map(([field,key, suffix])=>
              r.jsx(Qa,{field,name:"milestone-"+suffix,value:row[key],change:value=>change({...row,[key]:value}),gateway:o,errors},key)),
            r.jsx(Og,{errors,change:signature=>change({...row,signature})})
          ]})})
      ]})
    ]})`,
  );

  // Keep the form-load defaults until a user input event changes them.
  replace(
    'se=C.useRef(null),he=C.useRef(null),ae=C.useRef(null),Se=',
    'se=C.useRef(null),he=C.useRef(null),ae=C.useRef(null),[typeWasSelected,setTypeWasSelected]=C.useState(false),[estimateOverride,setEstimateOverride]=C.useState(null),[statusWasSelected,setStatusWasSelected]=C.useState(false),Se=',
  );
  replace(
    'F==="Product_Line"?!Se&&S.values.Project_Type!==x.values.Project_Type',
    'F==="Product_Line"?!Se&&(typeWasSelected||S.values.Project_Type!==x.values.Project_Type)',
  );
  replace(
    'F==="Estimated_Commission_Date"?!Se&&(!!S.values.EXW_Factory_Date||S.values.Project_Type!==x.values.Project_Type):',
    'F==="Estimated_Commission_Date"?!Se&&(estimateOverride??(!!S.values.EXW_Factory_Date||S.values.Project_Type!==x.values.Project_Type)):',
  );
  replace(
    'oe=u.filter(({name:F})=>au(F,Se,o.raw.Warranty_Tickets))',
    'oe=u.filter(({name:F})=>au(F,Se,typeWasSelected||o.raw.Warranty_Tickets))',
  );
  replace(
    'F==="BX_Code"?!Se:Ij.has(F)?!1:',
    'F==="BX_Code"?!Se:Object.values(projectPlanningFields).includes(F)?!Se&&statusWasSelected&&projectPlanningFields[S.values.Status]===F:Ij.has(F)?!1:',
  );
  replace(
    'F==="Commission_Complete_Date"?De>=Zr.indexOf("Commissioning")',
    'F==="Commission_Complete_Date"?De>=Zr.indexOf("HP Testing")',
  );
  replace(
    'function Qj({gateway:l,record:initialRecord,',
    `const projectPlanningFields={
    Shipping:"Planning_Shipping_Complete_Date",
    Installing:"Planning_Installation_Complete_Date",
    Commissioning:"Planning_Commission_Complete_Date",
    Delivering:"Planning_HP_Testing_Complete_Date"
  };
  function Qj({gateway:l,record:initialRecord,`,
  );
  replace(
    'function de(F,be){fe(!1),p(Ee=>',
    `function de(F,be){
      if(F==="Project_Type"){
        if(L&&na(String(S.values.Project_Type))&&!na(String(be))){
          A("Save or reset your milestone edits before changing the project type.");
          return;
        }
        setTypeWasSelected(true);
        setEstimateOverride(!na(String(be)));
      }
      if(F==="EXW_Factory_Date")setEstimateOverride(!!be);
      if(F==="Status")setStatusWasSelected(true);
      fe(!1),p(Ee=>`,
  );
  replace('visible:au("Milestone_Tracker",Se,xt)||L', 'visible:au("Milestone_Tracker",Se,xt)');
  replace(
    '(o==="Client"||o==="Site")&&(u.Service_Tickets=u.Service_Tickets.map(d=>({...d,values:{...d.values,Address:d.values.Address==="Online"?"Online":""}})))',
    'o==="Site"&&u.Site?.label&&(u.Service_Tickets=u.Service_Tickets.map(row=>row.values.Address?row:{...row,values:{...row.values,Address:u.Site.label}}))',
  );
  replace(
    'options:["Online",...c.Site?[c.Site.label]:[]]',
    'options:[...new Set(["Online",c.Site?.label,o.values.Address].filter(value=>typeof value==="string"&&value))]',
  );
  replace(
    '{...Ee,values:xe}}),w({})}function Ne(F,be,Ee)',
    `{...Ee,values:xe,sections:F==="Site"&&xe.Site?.label&&Ee.sections.Service_Tickets
      ?{...Ee.sections,Service_Tickets:Ee.sections.Service_Tickets.map(row=>
        !Object.hasOwn(row.values,"Address")||row.values.Address?row:
          {...row,values:{...row.values,Address:xe.Site.label}})}
      :Ee.sections}}),w({})}function Ne(F,be,Ee)`,
  );
  replace('r.jsx(Sa,{ungrouped:!0,title:"Delivery dates",', 'r.jsx(Sa,{title:"Shipping",');
  // Keep the same shipping controls and field ordering, with a group in Edit as well.
  const fieldsStart =
    'r.jsx("div",{className:"fields project-editor-fields",children:zg(le,Yj).filter(F=>Object.hasOwn(S.values,F.name)).map(F=>';
  replace(
    fieldsStart,
    'r.jsxs(r.Fragment,{children:[false,true].map(shipping=>{const fields=zg(le,Yj).filter(F=>Object.hasOwn(S.values,F.name)&&(["EXW_Factory_Date","Estimated_Commission_Date",...Object.values(projectPlanningFields)].includes(F.name)===shipping));if(!fields.length)return null;const controls=r.jsx("div",{className:"fields project-editor-fields",children:fields.map(F=>',
  );
  replace(
    'readOnly:ge(F.name)},F.name)})}),zg(oe,Xj)',
    'readOnly:ge(F.name)},F.name)})});return shipping?r.jsx(Sa,{title:"Shipping",children:controls},"shipping"):r.jsx(r.Fragment,{children:controls},"project-fields")})}),zg(oe,Xj)',
  );

  // The preserved Create form has these drafts and serializers, but no mounted row editors.
  replace(
    'function JS({draft:l,errors:o,gateway:c,set:u,showEstimate})',
    `
    function CreateActivityFields({definition,draft,gateway,row,index,change,errors,setBusy}){
      const [serialMessage,setSerialMessage]=C.useState("");
      const lookupVersion=C.useRef(0);
      C.useEffect(()=>()=>{lookupVersion.current++},[]);

      async function findSerial(){
        const serial=String(row.values.Serial_Number??"").trim();
        if(!serial||!gateway.serialDetails)return;
        const version=++lookupVersion.current;
        setBusy(true);
        setSerialMessage("Finding serial number…");
        try{
          const match=await gateway.serialDetails(serial);
          if(version!==lookupVersion.current)return;
          if(match)change(current=>String(current.values.Serial_Number).trim()===serial
            ?{...current,values:{...current.values,Product_Code:match.code,Product_Model:match.model}}
            :current);
          setSerialMessage(match?"":"Serial number not found.");
        }catch(error){
          if(version===lookupVersion.current)setSerialMessage(we(error));
        }finally{
          if(version===lookupVersion.current)setBusy(false);
        }
      }

      return r.jsxs("div",{className:"fields",children:[
        ...Gg(definition,row,draft).map(field=>{
          const control=r.jsx(Qa,{
            field:{...field,kind:field.type},name:definition.name+"."+index+"."+field.name,
            value:row.values[field.name],gateway,errors,
            disabled:definition.name==="Service_Tickets"&&field.name==="Status"&&!!row.values.Aimed_End_Time,
            change:value=>{
              if(field.name==="Serial_Number"){
                lookupVersion.current++;setBusy(false);setSerialMessage("");
              }
              change(current=>sS(current,field.name,value));
            }
          },field.name);
          return field.name==="Serial_Number"
            ?r.jsx("div",{onBlur:()=>void findSerial(),children:control},field.name):control;
        }),
        serialMessage&&r.jsx("p",{className:"hint",role:"status",children:serialMessage})
      ]});
    }

    function CreateActivitySection({definition,draft,gateway,set}){
      const [editing,setEditing]=C.useState();
      const rows=draft[definition.name];
      const label=definition.name==="Service_Tickets"?"internal service ticket":
        definition.name==="Warranty_Tickets"?"warranty ticket":definition.singular.toLowerCase();
      const fields=[...definition.fields,{name:"rowActions",label:"Actions"}];
      const tableRows=rows.map(({key,values})=>Object.fromEntries([
        ["ID",key],...Object.entries(values).map(([name,value])=>[
          name,Array.isArray(value)?value.map(item=>item?.label??item):value?.label??value
        ])
      ]));
      return r.jsxs(Sa,{title:definition.title,children:[
        r.jsx(is,{fields,rows:tableRows,label:definition.title,requiredMarkers:true,
          className:definition.name==="Issue_Register"?"issue-detail-table":"",
          renderCell:(field,record)=>{
            if(field.name!=="rowActions")return;
            const index=rows.findIndex(row=>row.key===record.ID);
            return r.jsxs("div",{className:"table-row-actions",children:[
              r.jsx("button",{type:"button",className:"icon-button","aria-label":"Edit "+label+" "+(index+1),
                onClick:()=>setEditing(index),children:r.jsx(Kp,{size:16,"aria-hidden":true})}),
              r.jsx("button",{type:"button",className:"icon-button","aria-label":"Remove "+label+" "+(index+1),
                onClick:()=>set(definition.name,rows.filter(row=>row.key!==record.ID)),children:r.jsx(ko,{size:16,"aria-hidden":true})})
            ]});
          }}),
        r.jsx("div",{className:"project-table-footer",children:r.jsx(Id,{
          draft,set,section:definition.name,editIndex:editing,closeEdit:()=>setEditing(undefined),
          label:"Add "+label,initial:()=>rS(definition),
          fields:(row,index,change,errors,setBusy)=>r.jsx(CreateActivityFields,{
            definition,draft,gateway,row,index,change,errors,setBusy
          })
        })})
      ]});
    }
    function JS({draft:l,errors:o,gateway:c,set:u,showEstimate})
  `,
  );
  replace(
    'r.jsx(Sa,{ungrouped:!0,title:"Additional notes",children:',
    `l.Project_Type&&!na(l.Project_Type)&&iu.map(definition=>r.jsx(CreateActivitySection,{
      definition,draft:l,gateway:c,set:u
    },definition.name)),r.jsx(Sa,{ungrouped:!0,title:"Additional notes",children:`,
  );
  return bundle;
}

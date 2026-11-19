import { buildSync } from 'esbuild';

/** Extend the recovered workspace's chooser, report column catalog and preference codec. */
export function patchExpandedProjectColumns(input) {
  let bundle = input;
  function replace(before, after) {
    if (bundle.split(before).length !== 2) {
      throw new Error(`Expanded column patch did not match: ${before.slice(0, 100)}`);
    }
    bundle = bundle.replace(before, () => after);
  }

  const start = bundle.indexOf('var columnSettings = (() => {');
  const terminator = '\n})();';
  const end = bundle.indexOf(terminator, start);
  if (start < 0 || end < 0) throw new Error('Could not locate the recovered column chooser.');
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
  bundle = bundle.slice(0, start) + component + bundle.slice(end + terminator.length);

  const originalTopFields = [
    'Project_ID',
    'Project_Name',
    'Configuration',
    'Client',
    'Project_Manager',
    'Status',
    'PCS_Capacity',
    'BESS_Capacity',
    'Inverter_Capacity',
    'Added_By',
    'Added_Time',
    'Project_Type',
    'Product_Line',
    'Site',
    'PO',
    'Software_Iteration',
    'Issue_Register',
    'Warranty_Tickets',
    'Service_Tickets',
    'EXW_Factory_Date',
    'Estimated_Commission_Date',
    'Commission_Complete_Date',
    'BOM',
    'Country',
    'State',
    'Milestone_Tracker',
    'Service_Requests',
    'Project_Notes',
    'BX_Code',
    'Stakeholders',
    'Scenario',
    'Coupling_Type',
    'Sales',
    'C4',
    'Distributor',
    'Rectification',
    'Warranty_Commencement_Date',
    'Warranty_End_Date',
  ];
  const original =
    'se=C.useMemo(()=>{const B=Kr;return gf.flatMap(J=>B.filter(ye=>ye.name===J))},[])';
  replace(original, 'se=C.useMemo(()=>projectReportColumns,[])');
  replace(
    'const sg=["Project_Name","Client","Status","Project_Manager","Project_Type"]',
    `
    const projectReportTopNames=${JSON.stringify(originalTopFields)};
    const normalizeProjectColumnName=name=>name==="State_chosen"?"State":name;
    function projectReportColumnGroup(parent,title,fields){
      return fields.map(({name,label})=>({name:parent+"."+name,label:title+" · "+label.trim()}));
    }
    const projectReportColumns=[
      ...projectReportTopNames.map(name=>ul.find(column=>column.name===name)??{name,label:name}),
      ...pt.flatMap(section=>projectReportColumnGroup(section.name,section.title,section.fields)),
      ...projectReportColumnGroup("Rectification","Rectification",[
        {name:"Type_field",label:"Type"},{name:"Product_Line",label:"Product Line"}]),
      ...projectReportColumnGroup("Milestone_Tracker","Milestone Tracker",ns),
      ...projectReportColumnGroup("BOM","BOM",[
        {name:"C4_Number_Project",label:"C4 Number"},{name:"Original_Product_Code",label:"Original Product Code"},
        ...Ii.filter(field=>field.name!=="History"),{name:"Dispatch_Date",label:"Dispatch Date"}]),
      ...projectReportColumnGroup("C4","C4",[
        {name:"C4_Number",label:"C4 Number"},{name:"ERP_Number",label:"ERP Number"},
        {name:"C4_Contact_Name",label:"C4 Contact Name"},{name:"C4_Type",label:"C4 Type"},
        {name:"Direct_Sales_Order_Number",label:"Direct Sales Order Number"},
        {name:"SPO",label:"SPO"},{name:"MIGO",label:"MIGO"},{name:"Delivery",label:"Delivery"},
        {name:"Linked_CSR",label:"Linked CSR"}])
    ];
    const projectReportColumnNames=new Set(projectReportColumns.map(column=>column.name));
    const sg=["Project_Name","Client","Status","Project_Manager","Project_Type"]`,
  );
  replace(
    'return og.find(c=>c.name===o)});function Gi(l,o)',
    'return og.find(c=>c.name===o)});for(const column of projectReportColumns)if(!Kr.some(existing=>existing.name===column.name))Kr.push(column);function Gi(l,o)',
  );
  replace(
    'const o=Kr.filter(u=>!u.name.includes(".")).map(u=>u.name),c=new Set(o);return[...new Set(["Project_Name",...l.filter(u=>c.has(u)),...o])]',
    'return[...new Set(["Project_Name",...l.map(normalizeProjectColumnName).filter(name=>projectReportColumnNames.has(name)),...projectReportTopNames])]',
  );
  replace('function ug(l){return su(l).filter(o=>gf.includes(o))}', 'function ug(l){return su(l)}');
  replace(
    'const c=o.filter(d=>l.includes(d));return[["Project_Name","Status"',
    'if(l.some(name=>!gf.includes(name)))return false;const c=o.filter(d=>l.includes(d));return[["Project_Name","Status"',
  );
  replace(
    'function zS(l){return su(l).join(" ")}function cg(l){return su(l.trim().split(/\\s+/))}function su(l){const o=new Set(Kr.map(c=>c.name));return[...new Set(["Project_Name",...l.filter(c=>o.has(c)).map(c=>c.split(".")[0])])]}',
    `function zS(names){return su(names).map(name=>name.includes(".")?"subcolumn:"+name:name).join(" ")}
    function cg(text){return su(text.trim().split(/\\s+/).map(token=>token.startsWith("subcolumn:")
      ?token.slice("subcolumn:".length):token.split(".")[0]))}
    function su(names){return [...new Set(["Project_Name",...names.map(normalizeProjectColumnName).filter(name=>projectReportColumnNames.has(name))])]}`,
  );
  replace(
    'se.filter(B=>!B.name.includes(".")&&(he.fields===null||he.fields.includes(B.name)))',
    'se.filter(B=>he.fields===null||he.fields.includes(B.name))',
  );

  // Use the report's existing nested lookup for list values, quick search, and sorting.
  replace(
    'function Gi(l,o){const c=o.split(".");function u(d,m)',
    `function Gi(l,o){
    if(o==="State"&&!ze(l.State).trim()&&ze(l.State_chosen).trim())return l.State_chosen;
    const c=o.split(".");
    if(c[0]==="C4"&&Array.isArray(l.C4_Legacy)&&l.C4_Legacy.length &&
      (c.length>1||!l.C4?.length))c[0]="C4_Legacy";
    function u(d,m)`,
  );
  replace(
    'return u(d[c[m]],m+1)}return u(l,0)}function Fe',
    'return u(Object.hasOwn(d,c[m])?d[c[m]]:_e(d.zc_display_value)[c[m]],m+1)}return u(l,0)}function Fe',
  );
  return bundle;
}

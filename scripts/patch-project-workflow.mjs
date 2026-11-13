import { buildSync } from 'esbuild';

/** Align the preserved widget with the November 11 Creator export without rebuilding old source. */
export function patchProjectWorkflow(input) {
  let bundle = input;
  function replace(before, after) {
    if (bundle.split(before).length !== 2)
      throw new Error(`Project workflow patch did not match: ${before.slice(0, 85)}`);
    bundle = bundle.replace(before, after);
  }

  replace('"Inverter_raw_data_Report"', '"SN_raw_data_Report"');
  replace('The inverter raw data report must expose', 'The SN raw data report must expose');
  replace(
    'fields:"Rectification_ID,Rectification_Project,Type_field,Product_Line,Fault,Software_Packages"',
    'fields:"Rectification_ID,Rectification_Project,Type_field,Product_Line,Fault,GSP_Number"',
  );
  const hydrateStart = bundle.indexOf('async function PS(');
  const hydrateEnd = bundle.indexOf('function Yo(', hydrateStart);
  if (hydrateStart < 0 || hydrateEnd < hydrateStart)
    throw new Error('Rectification package loader boundaries did not match.');
  // Bundle the same readable loader used by the source adapter into the preserved build.
  const loader = buildSync({
    entryPoints: ['app/src/services/rectificationPackages.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'rectificationWorkflow',
    target: 'es2022',
  }).outputFiles[0].text;
  bundle =
    loader +
    bundle.slice(0, hydrateStart) +
    `async function PS(sdk,rows){
    return rectificationWorkflow.loadRectificationPackages(rows,async ids=>(await xa(sdk,{
      report_name:"Rectification_Projects",field_config:"custom",fields:"Software_Packages",
      criteria:"("+ids.map(id=>"ID == "+id).join(" || ")+")",max_records:200
    })).rows);
  }` +
    bundle.slice(hydrateEnd);
  replace(
    'parentId:Jr(c.Rectification_Project).id,type:c.Type_field',
    'parentId:Jr(c.Rectification_Project).id,...Object.hasOwn(c,"GSP_Number")?{gspNumber:ze(c.GSP_Number)}:{},type:c.Type_field',
  );
  // Copy hidden workflow metadata only when returned, preserving permission-limited records.
  for (const [target, meta] of [
    ['d', 'f'],
    ['_', 'N'],
  ]) {
    replace(
      `Object.assign(${target},{Rectification_ID:${meta}.parentId,Type_field:${meta}.type,Product_Line:${meta}.productLine.id})`,
      `Object.assign(${target},{Rectification_ID:${meta}.parentId,Type_field:${meta}.type,Product_Line:${meta}.productLine.id,...${meta}.gspNumber!==void 0?{GSP_Number:${meta}.gspNumber}:{}})`,
    );
  }
  // Edit_Load hides Product Line initially; changing Project Type follows its input workflow.
  replace(
    'return Ij.has(F)?!1:F==="State"?',
    'return F==="Product_Line"?!Se&&S.values.Project_Type!==x.values.Project_Type:F==="BX_Code"?!Se:Ij.has(F)?!1:F==="State"?',
  );
  replace(
    'F==="Estimated_Commission_Date"?!Se&&!!S.values.EXW_Factory_Date:',
    'F==="Estimated_Commission_Date"?!Se&&(!!S.values.EXW_Factory_Date||S.values.Project_Type!==x.values.Project_Type):',
  );
  replace(
    'readOnly:F.name==="Service_Tickets"&&Ae.name==="Status"&&!!be.values.Aimed_End_Time,',
    'readOnly:F.name==="Service_Tickets"&&(Ae.name==="Status"&&!!be.values.Aimed_End_Time||Ae.name==="Staff"&&!!be.id),',
  );
  return bundle;
}

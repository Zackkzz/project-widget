import type { LookupOption } from './lookup.types';
import type { BomRow } from './bom.types';
import type { ActivityRow } from './activities.types';
export interface Row {
  key: string;
}

export interface ConfigurationRow extends Row {
  Model: LookupOption | null;
  Number: string;
}

export interface PurchaseOrder extends Row {
  PO_Number: string;
  Date_field: string;
  C4_Number: string;
  PO_Type: string;
  Amount: string;
  Payment_Status: string;
  Status: string;
}

export interface ServiceRequest extends Row {
  Subject_field: string;
  External_Reference: string;
  Address: string;
  Close_Date: string;
  Staff: LookupOption[];
  Type_field: LookupOption | null;
  Service_Type: string;
  External_or_Internal: string;
  Start_Date: string;
  Status: string;
  Job_Description: string;
}

export interface ProjectDraft {
  Project_Name: string;
  Project_Type: string;
  Scenario: string[];
  Coupling_Type: string;
  Product_Line: string;
  Status: string;
  Country: LookupOption | null;
  State: string;
  Client: LookupOption | null;
  Site: LookupOption | null;
  Project_Manager: LookupOption | null;
  Sales: LookupOption | null;
  Distributor: LookupOption | null;
  C4: LookupOption[];
  Stakeholders: string;
  PCS_Capacity: string;
  BESS_Capacity: string;
  Inverter_Capacity: string;
  BX_Code: string;
  Project_Notes: string;
  EXW_Factory_Date: string;
  Estimated_Commission_Date: string;
  Commission_Complete_Date: string;
  Warranty_Commencement_Date: string;
  Warranty_End_Date: string;
  Configuration: ConfigurationRow[];
  PO: PurchaseOrder[];
  BOM: BomRow[];
  Service_Requests: ServiceRequest[];
  Warranty_Tickets: ActivityRow[];
  Issue_Register: ActivityRow[];
  Software_Iteration: ActivityRow[];
  Rectification: ActivityRow[];
  Service_Tickets: ActivityRow[];
}

export type Errors = Record<string, string>;

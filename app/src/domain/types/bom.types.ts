import type { Row } from './project.types';
import type { LookupOption } from './lookup.types';
export interface BomRow extends Row {
  Original_Product_Model: LookupOption | null;
  Original_SN: string;
  Original_Quantity: string;
  Warranty_Type: LookupOption | null;
  Warranty_Start_Date: string;
  Warranty_End_Date: string;
}

export interface BomModelTotals {
  label: string;
  quantity: number;
  serials: number;
}

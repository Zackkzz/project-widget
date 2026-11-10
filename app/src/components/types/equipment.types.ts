import type { ProjectDraft, Errors } from '../../domain/types/project.types';
import type { Gateway } from '../../services/types/creator.types';
export interface FormProps {
  draft: ProjectDraft;
  errors: Errors;
  gateway: Gateway;
  set: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
}

export type EquipmentFieldName =
  | 'PCS_Capacity'
  | 'BESS_Capacity'
  | 'Inverter_Capacity'
  | 'EXW_Factory_Date'
  | 'Estimated_Commission_Date'
  | 'Commission_Complete_Date'
  | 'Warranty_Commencement_Date'
  | 'Warranty_End_Date';

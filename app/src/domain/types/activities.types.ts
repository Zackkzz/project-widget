import type { LookupOption } from './lookup.types';
import type { Source } from '../../services/types/creator.types';
export type ActivityValue = string | LookupOption | LookupOption[] | null;

export interface ActivityRow {
  key: string;
  values: Record<string, ActivityValue>;
}

export type ActivityName =
  | 'Warranty_Tickets'
  | 'Issue_Register'
  | 'Software_Iteration'
  | 'Rectification'
  | 'Service_Tickets';

export interface ActivityField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'datetime-local' | 'select' | 'lookup' | 'multi';
  required?: boolean;
  source?: Source;
  options?: readonly string[];
  initial?: string;
  hint?: string;
  forType?: 'Hardware' | 'Software';
}

export interface ActivityDefinition {
  name: ActivityName;
  title: string;
  singular: string;
  description: string;
  fields: ActivityField[];
}

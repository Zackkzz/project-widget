import type { Source, Gateway } from '../../services/types/creator.types';
import type { LookupOption } from '../../domain/types/lookup.types';
import type { Errors } from '../../domain/types/project.types';
export interface LookupProps {
  name: string;
  label: string;
  source: Source;
  gateway: Gateway;
  value: LookupOption | null;
  onChange: (value: LookupOption | null) => void;
  errors: Errors;
  required?: boolean;
  clientId?: string;
  disabled?: boolean;
  preload?: boolean;
  hint?: string;
}

export type MultiLookupProps = Omit<LookupProps, 'value' | 'onChange'> & {
  values: LookupOption[];
  onChange: (values: LookupOption[]) => void;
};

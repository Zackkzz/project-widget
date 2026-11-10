import type { Errors } from '../../domain/types/project.types';
import type { ReactNode } from 'react';
export interface FieldProps {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  errors: Errors;
  children: ReactNode;
  wide?: boolean;
}

export interface TextFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: Errors;
  required?: boolean;
  hint?: string;
  type?: string;
  wide?: boolean;
  readOnly?: boolean;
  onBlur?: () => void;
  min?: number;
  step?: string;
}

export interface SelectFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  errors: Errors;
  required?: boolean;
  hint?: string;
}

export interface TextAreaProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: Errors;
}

export interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}

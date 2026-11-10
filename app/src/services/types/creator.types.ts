import type { LookupOption } from '../../domain/types/lookup.types';
import type { ActivityRow } from '../../domain/types/activities.types';
import type { Errors } from '../../domain/types/project.types';
import type { SOURCES } from '../creator';
// Derive valid lookup names from the allowlist; the type-only import adds no runtime dependency.
export type Source = keyof typeof SOURCES;

export interface LookupPage {
  options: LookupOption[];
  cursor?: string;
}

export interface CreatedProject {
  id: string;
  projectId?: string;
}

export interface Gateway {
  mode: 'live' | 'preview';
  lookup(source: Source, query: string, clientId?: string, cursor?: string): Promise<LookupPage>;
  currentStaff(): Promise<LookupOption | null>;
  serialDetails(
    serial: string,
  ): Promise<{ code: string; model: string; product: LookupOption | null } | null>;
  checkTickets(rows: ActivityRow[]): Promise<Errors>;
  create(data: Record<string, unknown>): Promise<CreatedProject>;
  openProject(id: string): Promise<void>;
  openForm(
    form: 'Client' | 'Site' | 'Milestone_Tracker' | 'Project',
    values?: Record<string, string>,
  ): Promise<void>;
}

export type Json = Record<string, unknown>;

export interface CreatorRecordPage {
  rows: Json[];
  cursor?: string;
}

export interface CreatorSDK {
  DATA: { getRecords(config: Json): Promise<unknown>; addRecords(config: Json): Promise<unknown> };
  UTIL: { getInitParams(): Promise<unknown>; navigateParentURL(config: Json): Promise<unknown> };
}

declare global {
  interface Window {
    ZOHO?: { CREATOR: CreatorSDK };
  }
}

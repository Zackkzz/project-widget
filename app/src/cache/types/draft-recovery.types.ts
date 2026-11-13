export interface EditorRow {
  key: string;
  id?: string;
  original: Record<string, unknown>;
  values: Record<string, unknown>;
  files?: File[];
}

export interface EditorDraft {
  values: Record<string, unknown>;
  sections: Record<string, EditorRow[]>;
}

export interface DraftConflict {
  key: string;
  path: string[];
  mine: unknown;
  latest: unknown;
  before?: unknown;
  deleted?: boolean;
}

export interface RecoveryOrigin {
  base: EditorDraft;
  draft: EditorDraft;
  choices: Record<string, 'mine' | 'latest'>;
}

export interface SavedEditorDraft {
  id: string;
  isBom: boolean;
  base: EditorDraft;
  draft: EditorDraft;
  recovery?: RecoveryOrigin;
  savedAt: number;
  missingFiles?: boolean;
  uncertain?: boolean;
  bytes?: number;
}

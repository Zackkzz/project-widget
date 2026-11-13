import type * as React from 'react';
import type { DraftConflict } from './draft-recovery.types';

export interface RecoveryPanelOptions {
  title: string;
  message: string;
  conflicts: DraftConflict[];
  unresolved: number;
  choices: Record<string, 'mine' | 'latest'>;
  automaticCount: number;
  ready: boolean;
  open: boolean;
  busy: boolean;
  label: (conflict: DraftConflict) => string;
  resolve: (key: string, choice: 'mine' | 'latest') => void;
  review: () => void;
  closeReview: () => void;
  finishReview: () => void;
  refresh: () => void;
}

export interface RecoveryDialogProps {
  react: typeof React;
  options: RecoveryPanelOptions;
}

import type { FormProps } from './equipment.types';
import type { ActivityDefinition, ActivityRow } from '../../domain/types/activities.types';
export type ActivityEditorProps = FormProps & {
  definition: ActivityDefinition;
  row: ActivityRow;
  index: number;
  change: (row: ActivityRow) => void;
};

export type ActivitySectionProps = FormProps & { definition: ActivityDefinition };

export type ActivityReviewProps = Pick<FormProps, 'draft'>;

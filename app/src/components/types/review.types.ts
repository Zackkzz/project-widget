import type { ProjectDraft } from '../../domain/types/project.types';
export interface ReviewProps {
  draft: ProjectDraft;
  edit: (step: number) => void;
}

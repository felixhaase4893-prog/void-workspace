import { createContext, useContext } from 'react';

import type { EntityType } from '../../domain/models';

/** Values to pre-fill when creating an item, e.g. from a project's detail page. */
export interface CreatePreset {
  projectId?: string;
  /** A due date (`YYYY-MM-DD`) for new tasks. */
  dueDate?: string;
  /** A title (or project name) typed elsewhere, e.g. in Quick Add before choosing "More options". */
  title?: string;
}

export interface DeleteDialogOptions {
  /** Runs after a successful delete, e.g. to leave a detail page that no longer exists. */
  onDeleted?: () => void;
}

export interface EntityDialogContextValue {
  openCreateDialog: (type: EntityType, preset?: CreatePreset) => void;
  openEditDialog: (type: EntityType, id: string) => void;
  openDeleteDialog: (type: EntityType, id: string, options?: DeleteDialogOptions) => void;
}

export const EntityDialogContext = createContext<EntityDialogContextValue | null>(null);

export function useEntityDialogs(): EntityDialogContextValue {
  const value = useContext(EntityDialogContext);
  if (!value) throw new Error('useEntityDialogs must be used inside <EntityDialogProvider>.');
  return value;
}

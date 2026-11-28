import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react';

import { Dialog } from '../../components/ui/Dialog';
import type { EntityOfType, EntityType } from '../../domain/models';
import { findEntity } from '../../domain/workspace';
import { useWorkspace } from '../../state/workspaceContext';
import { DeleteDialog } from './DeleteDialog';
import { EntityDialogContext, type CreatePreset, type DeleteDialogOptions, type EntityDialogContextValue } from './entityDialogContext';
import { BugForm, NoteForm, ProjectForm, SnippetForm, TaskForm, type EntityFormComponentProps } from './forms';
import { type MessageKey, t } from '../../i18n/translate';

type AnyEntityForm = ComponentType<EntityFormComponentProps<EntityOfType[EntityType]>>;

// Each form only ever receives entities of its own type (see FormDialog), so widening is safe.
const FORMS: Record<EntityType, AnyEntityForm> = {
  project: ProjectForm as AnyEntityForm,
  task: TaskForm as AnyEntityForm,
  note: NoteForm as AnyEntityForm,
  snippet: SnippetForm as AnyEntityForm,
  bug: BugForm as AnyEntityForm,
};

const COPY: Record<EntityType, { create: MessageKey; edit: MessageKey; description: MessageKey }> = {
  project: { create: 'New project', edit: 'Edit project', description: 'A home for related tasks, notes and snippets.' },
  task: { create: 'New task', edit: 'Edit task', description: 'Something that needs to get done.' },
  note: { create: 'New note', edit: 'Edit note', description: 'Capture a technical thought or decision.' },
  snippet: { create: 'New snippet', edit: 'Edit snippet', description: 'Save a piece of code you will want again.' },
  bug: { create: 'New bug', edit: 'Edit bug', description: 'Something that is broken and needs fixing.' },
};

type DialogState =
  | { mode: 'create'; type: EntityType; preset: CreatePreset | undefined }
  | { mode: 'edit'; type: EntityType; id: string }
  | { mode: 'delete'; type: EntityType; id: string; onDeleted: (() => void) | undefined };

/** Hosts the create, edit and delete dialogs so any page can open them. */
export function EntityDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const value = useMemo<EntityDialogContextValue>(
    () => ({
      openCreateDialog: (type: EntityType, preset?: CreatePreset) => setDialog({ mode: 'create', type, preset }),
      openEditDialog: (type: EntityType, id: string) => setDialog({ mode: 'edit', type, id }),
      openDeleteDialog: (type: EntityType, id: string, options?: DeleteDialogOptions) =>
        setDialog({ mode: 'delete', type, id, onDeleted: options?.onDeleted }),
    }),
    [],
  );

  return (
    <EntityDialogContext.Provider value={value}>
      {children}
      {dialog?.mode === 'delete' && <DeleteDialog type={dialog.type} id={dialog.id} onClose={close} onDeleted={dialog.onDeleted} />}
      {dialog && dialog.mode !== 'delete' && <FormDialog state={dialog} onClose={close} />}
    </EntityDialogContext.Provider>
  );
}

function FormDialog({ state, onClose }: { state: Exclude<DialogState, { mode: 'delete' }>; onClose: () => void }) {
  const workspace = useWorkspace();
  const copy = COPY[state.type];
  const Form = FORMS[state.type];

  if (state.mode === 'edit') {
    const entity = findEntity(workspace, state.type, state.id);
    // The item was deleted meanwhile, e.g. in another tab.
    if (!entity) return null;
    return (
      <Dialog open onClose={onClose} title={t(copy.edit)}>
        <Form key={state.id} entity={entity} onDone={onClose} />
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={onClose} title={t(copy.create)} description={t(copy.description)}>
      <Form preset={state.preset} onDone={onClose} />
    </Dialog>
  );
}

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';

import { ENTITY_ICONS, ENTITY_ROUTES } from '../../app/navigation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Kbd } from '../../components/ui/Kbd';
import { useToast } from '../../components/ui/toastContext';
import { BUG_PRIORITY_LABELS, ENTITY_LABELS, PROJECT_KIND_LABELS, TASK_PRIORITY_LABELS } from '../../domain/labels';
import { BUG_PRIORITIES, PROJECT_KINDS, TASK_PRIORITIES, type EntityType } from '../../domain/models';
import { cn } from '../../lib/cn';
import { useWorkspace, useWorkspaceActions, type SaveResult } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { ProjectReferenceSelect } from '../create/ProjectReferenceSelect';
import { buildQuickAddInput, EMPTY_DRAFT, QUICK_ADD_TYPES, type QuickAddDraft, type QuickAddField, type QuickAddInput } from './quickAddInput';
import { localized, t } from '../../i18n/translate';

const PLACEHOLDERS = localized<EntityType>({
  task: 'What needs doing?',
  project: 'Project name',
  note: 'Note title',
  snippet: 'Snippet title',
  bug: 'What is broken?',
});

const CREATE_LABELS = localized<EntityType>({
  task: 'Create task',
  project: 'Create project',
  note: 'Create note',
  snippet: 'Create snippet',
  bug: 'Create bug',
});

const LANGUAGE_SUGGESTIONS = ['TypeScript', 'JavaScript', 'Luau', 'Lua', 'Python', 'C#', 'C++', 'Rust', 'Go', 'GDScript', 'SQL', 'Shell', 'HTML', 'CSS'];

interface QuickAddDialogProps {
  type: EntityType;
  onTypeChange: (type: EntityType) => void;
  onClose: () => void;
}

/**
 * One small palette to create any kind of item without leaving the current
 * page. Only the essentials are asked for; "More options" continues in the
 * full form with everything typed so far.
 */
export function QuickAddDialog({ type, onTypeChange, onClose }: QuickAddDialogProps) {
  const workspace = useWorkspace();
  const actions = useWorkspaceActions();
  const { showToast } = useToast();
  const { openCreateDialog } = useEntityDialogs();
  const navigate = useNavigate();
  const projectMatch = useMatch('/projects/:projectId');
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // On a project's page, new items belong to that project unless changed.
  const [draft, setDraft] = useState<QuickAddDraft>(() => {
    const projectId = projectMatch?.params.projectId ?? '';
    const project = workspace.projects.find((entry) => entry.id === projectId && entry.status !== 'archived');
    return { ...EMPTY_DRAFT, projectId: project ? project.id : '' };
  });
  const [errors, setErrors] = useState<Partial<Record<QuickAddField, string>>>({});
  const [pending, setPending] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  const label = ENTITY_LABELS[type];
  const set = <K extends keyof QuickAddDraft>(key: K, value: QuickAddDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const switchType = (next: EntityType) => {
    onTypeChange(next);
    setErrors({});
  };

  const create = (value: QuickAddInput): Promise<SaveResult> => {
    switch (value.type) {
      case 'project':
        return actions.createProject(value.input);
      case 'task':
        return actions.createTask(value.input);
      case 'note':
        return actions.createNote(value.input);
      case 'snippet':
        return actions.createSnippet(value.input);
      case 'bug':
        return actions.createBug(value.input);
    }
  };

  const submit = async (keepOpen: boolean) => {
    if (pending) return;
    const result = buildQuickAddInput(type, draft);
    if (!result.ok) {
      setErrors(result.errors);
      // Focus the first field that needs attention once the errors are rendered.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setPending(true);
    const saved = await create(result.value);
    setPending(false);
    const title = draft.title.trim();
    if (saved.ok) {
      showToast(t('{label} “{title}” created.', { label, title }), 'success', {
        action: { label: t('View'), onAction: () => navigate(ENTITY_ROUTES[type]) },
      });
    } else {
      showToast(t('Created for now, but not saved: {reason}', { reason: saved.error.message }), 'danger');
    }
    if (!keepOpen) {
      onClose();
      return;
    }
    // Ready for the next one: keep type, project, priority and language.
    setCreatedCount((count) => count + 1);
    setDraft((current) => ({ ...current, title: '', content: '', code: '', dueDate: '' }));
    titleRef.current?.focus();
  };

  const openFullForm = () => {
    const preset = { title: draft.title, ...(draft.projectId ? { projectId: draft.projectId } : {}), ...(draft.dueDate ? { dueDate: draft.dueDate } : {}) };
    onClose();
    openCreateDialog(type, preset);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.nativeEvent.isComposing) return;
    // Alt+1 … Alt+5 switch the type from anywhere in the palette.
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const digit = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)?.[1];
      const next = digit ? QUICK_ADD_TYPES[Number(digit) - 1] : undefined;
      if (next) {
        event.preventDefault();
        switchType(next);
      }
      return;
    }
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    const inTextarea = target instanceof HTMLTextAreaElement;
    const isButton = target instanceof HTMLButtonElement;
    // Enter creates from single-line fields; Ctrl+Enter from anywhere, also from multi-line fields.
    if ((event.ctrlKey || event.metaKey) || (!inTextarea && !isButton)) {
      event.preventDefault();
      void submit(event.shiftKey);
    }
  };

  const onTypeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = QUICK_ADD_TYPES[(index + step + QUICK_ADD_TYPES.length) % QUICK_ADD_TYPES.length] ?? 'task';
    switchType(next);
    const group = event.currentTarget.parentElement;
    requestAnimationFrame(() => group?.querySelector<HTMLElement>(`[data-type="${next}"]`)?.focus());
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Quick add')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={openFullForm} className="mr-auto">
            {t('More options…')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" size="sm" disabled={pending}>
            {pending ? t('Saving…') : CREATE_LABELS[type]}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        ref={formRef}
        noValidate
        onKeyDown={onKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
        className="space-y-4"
      >
        <div role="radiogroup" aria-label={t('What to create')} className="grid grid-cols-5 gap-1 rounded-lg border border-line bg-canvas p-1">
          {QUICK_ADD_TYPES.map((entry, index) => {
            const Icon = ENTITY_ICONS[entry];
            const checked = entry === type;
            return (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-keyshortcuts={`Alt+${index + 1}`}
                title={t('{label} (Alt {key})', { label: ENTITY_LABELS[entry], key: index + 1 })}
                data-type={entry}
                tabIndex={checked ? 0 : -1}
                onClick={() => switchType(entry)}
                onKeyDown={(event) => onTypeKeyDown(event, index)}
                className={cn(
                  'flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                  checked ? 'bg-raised text-fg shadow-sm ring-1 ring-line-strong' : 'text-subtle hover:bg-raised/60 hover:text-muted',
                )}
              >
                <Icon className={cn('size-3.5 shrink-0', checked && 'text-accent-300')} aria-hidden="true" />
                <span className="truncate">{ENTITY_LABELS[entry]}</span>
              </button>
            );
          })}
        </div>

        <Field label={type === 'project' ? t('Name') : t('Title')} error={errors.title}>
          {(field) => (
            <Input
              {...field}
              ref={titleRef}
              data-autofocus
              value={draft.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder={PLACEHOLDERS[type]}
              autoComplete="off"
              enterKeyHint="done"
              className="h-11 text-base sm:text-sm"
            />
          )}
        </Field>

        {type === 'project' && (
          <Field label={t('Type')}>
            {(field) => (
              <Select {...field} value={draft.kind} onChange={(event) => set('kind', event.target.value as QuickAddDraft['kind'])}>
                {PROJECT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PROJECT_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {type === 'task' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <ProjectReferenceSelect value={draft.projectId} onChange={(value) => set('projectId', value)} />
            <Field label={t('Priority')}>
              {(field) => (
                <Select {...field} value={draft.taskPriority} onChange={(event) => set('taskPriority', event.target.value as QuickAddDraft['taskPriority'])}>
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {TASK_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('Due date')} optional error={errors.dueDate}>
              {(field) => <Input {...field} type="date" value={draft.dueDate} onChange={(event) => set('dueDate', event.target.value)} className="[color-scheme:dark]" />}
            </Field>
          </div>
        )}

        {type === 'bug' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <ProjectReferenceSelect value={draft.projectId} onChange={(value) => set('projectId', value)} />
            <Field label={t('Priority')}>
              {(field) => (
                <Select {...field} value={draft.bugPriority} onChange={(event) => set('bugPriority', event.target.value as QuickAddDraft['bugPriority'])}>
                  {BUG_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {BUG_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        {type === 'note' && (
          <>
            <ProjectReferenceSelect value={draft.projectId} onChange={(value) => set('projectId', value)} />
            <Field label={t('Content')} optional error={errors.content} hint={t('Markdown works here too.')}>
              {(field) => <Textarea {...field} value={draft.content} onChange={(event) => set('content', event.target.value)} className="min-h-20" />}
            </Field>
          </>
        )}

        {type === 'snippet' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Language')} error={errors.language}>
                {(field) => (
                  <Input {...field} list={`${formId}-languages`} value={draft.language} onChange={(event) => set('language', event.target.value)} placeholder="TypeScript" autoComplete="off" />
                )}
              </Field>
              <ProjectReferenceSelect value={draft.projectId} onChange={(value) => set('projectId', value)} />
            </div>
            <datalist id={`${formId}-languages`}>
              {LANGUAGE_SUGGESTIONS.map((language) => (
                <option key={language} value={language} />
              ))}
            </datalist>
            <Field label={t('Code')} error={errors.code} hint={t('Ctrl+Enter saves from here.')}>
              {(field) => (
                <Textarea
                  {...field}
                  spellCheck={false}
                  value={draft.code}
                  onChange={(event) => set('code', event.target.value)}
                  className="min-h-28 font-mono text-[13px] [font-variant-ligatures:none]"
                />
              )}
            </Field>
          </>
        )}

        <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle sm:flex" aria-hidden="true">
          <span>
            <Kbd>Enter</Kbd> {t('create')}
          </span>
          <span>
            <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> {t('create & add another')}
          </span>
          <span>
            <Kbd>Alt</Kbd> <Kbd>1</Kbd>–<Kbd>5</Kbd> {t('switch type')}
          </span>
          <span>
            <Kbd>Esc</Kbd> {t('close')}
          </span>
        </p>
        <p role="status" className="sr-only">
          {createdCount > 0 ? t('{count} created. Ready for the next one.', { count: createdCount }) : ''}
        </p>
      </form>
    </Dialog>
  );
}

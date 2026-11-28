import { Check, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS, TASK_PRIORITY_LABELS } from '../../domain/labels';
import { BUG_PRIORITIES, BUG_STATUSES, TASK_PRIORITIES, type BugPriority, type BugStatus, type TaskPriority } from '../../domain/models';
import { cn } from '../../lib/cn';
import { useWorkspace } from '../../state/workspaceContext';
import { countLabel, useBulkActions, type BulkType } from './useBulkActions';
import type { SelectionState } from './useSelection';
import { type MessageKey, t } from '../../i18n/translate';

const NO_PROJECT = '__none__';
const PLURALS: Record<BulkType, MessageKey> = { task: 'tasks', bug: 'bugs' };

interface SelectionBarProps {
  type: BulkType;
  selection: SelectionState;
  /** How many rows are shown, for the "select all" checkbox. */
  visibleCount: number;
}

/**
 * The bulk actions bar of a list in selection mode. It sticks to the top while
 * scrolling. Deleting asks first; every action can be undone from its toast.
 */
export function SelectionBar({ type, selection, visibleCount }: SelectionBarProps) {
  const workspace = useWorkspace();
  const { editTasks, editBugs, deleteMany } = useBulkActions(type);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const allRef = useRef<HTMLInputElement>(null);
  const allId = useId();

  const ids = selection.ids;
  const count = ids.length;
  const none = count === 0;
  const projects = workspace.projects.filter((project) => project.status !== 'archived');

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && !selection.allSelected;
  }, [count, selection.allSelected]);

  const run = async (action: () => Promise<boolean>) => {
    setPending(true);
    const changed = await action();
    setPending(false);
    if (changed) selection.clear();
  };

  const setProject = (value: string) => {
    const projectId = value === NO_PROJECT ? null : value;
    const name = workspace.projects.find((project) => project.id === projectId)?.name ?? '';
    const describe = (items: string) => (projectId === null ? t('{items} moved out of their project.', { items }) : t('{items} moved to {project}.', { items, project: t('“{title}”', { title: name }) }));
    void run(() => (type === 'task' ? editTasks(ids, { projectId }, describe) : editBugs(ids, { projectId }, describe)));
  };

  const confirmDelete = async () => {
    await run(() => deleteMany(ids));
    setConfirming(false);
  };

  return (
    <div
      role="region"
      aria-label={t('Selected {items}', { items: t(PLURALS[type]) })}
      className="sticky top-16 z-20 mb-3 flex animate-fade-in flex-wrap items-center gap-2 rounded-card border border-accent-500/30 bg-overlay/95 px-3 py-2 shadow-lg shadow-black/40 backdrop-blur-md md:top-3"
    >
      <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5 pr-1">
        <input
          ref={allRef}
          id={allId}
          type="checkbox"
          checked={selection.allSelected}
          disabled={visibleCount === 0}
          onChange={selection.toggleAll}
          className="size-4 accent-accent-500"
        />
        <label htmlFor={allId} className="sr-only">
          {t('Select all shown {items}', { items: t(PLURALS[type]) })}
        </label>
        <p aria-live="polite" className="text-[13px] font-medium whitespace-nowrap text-fg">
          {none ? t('Select {items}', { items: t(PLURALS[type]) }) : t('{count} selected', { count })}
        </p>
      </div>

      <div className="order-3 flex w-full flex-wrap items-center gap-1.5 xl:order-2 xl:w-auto xl:justify-end">
        {type === 'task' ? (
          <>
            <Button size="sm" icon={<Check />} disabled={none || pending} onClick={() => void run(() => editTasks(ids, { status: 'done' }, (items) => t('{items} marked as done.', { items })))}>
              {t('Mark done')}
            </Button>
            <BulkSelect
              label={t('Set priority')}
              disabled={none || pending}
              options={TASK_PRIORITIES.map((priority) => ({ value: priority, label: TASK_PRIORITY_LABELS[priority] }))}
              onSelect={(value) => void run(() => editTasks(ids, { priority: value as TaskPriority }, (items) => t('{items} set to priority “{priority}”.', { items, priority: TASK_PRIORITY_LABELS[value as TaskPriority] })))}
            />
          </>
        ) : (
          <>
            <BulkSelect
              label={t('Set status')}
              disabled={none || pending}
              options={BUG_STATUSES.map((status) => ({ value: status, label: BUG_STATUS_LABELS[status] }))}
              onSelect={(value) => void run(() => editBugs(ids, { status: value as BugStatus }, (items) => t('{items} set to “{status}”.', { items, status: BUG_STATUS_LABELS[value as BugStatus] })))}
            />
            <BulkSelect
              label={t('Set priority')}
              disabled={none || pending}
              options={BUG_PRIORITIES.map((priority) => ({ value: priority, label: BUG_PRIORITY_LABELS[priority] }))}
              onSelect={(value) => void run(() => editBugs(ids, { priority: value as BugPriority }, (items) => t('{items} set to priority “{priority}”.', { items, priority: BUG_PRIORITY_LABELS[value as BugPriority] })))}
            />
          </>
        )}
        <BulkSelect
          label={t('Move to project')}
          disabled={none || pending}
          options={[{ value: NO_PROJECT, label: t('No project') }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          onSelect={setProject}
        />
        <Button size="sm" variant="ghost" icon={<Trash2 />} disabled={none || pending} onClick={() => setConfirming(true)} className="hover:text-danger">
          {t('Delete')}
        </Button>
      </div>
      <Button size="sm" variant="ghost" icon={<X />} onClick={selection.stop} title={t('Leave selection mode (Esc)')} className="order-2 xl:order-3">
        {t('Done')}
      </Button>

      {confirming && (
        <ConfirmDialog
          title={t('Delete {items}?', { items: countLabel(type, count) })}
          description={t('The selected items will be removed from this device. You can undo this for a few seconds afterwards.')}
          confirmLabel={t('Delete {items}', { items: countLabel(type, count) })}
          pending={pending}
          onConfirm={() => void confirmDelete()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

interface BulkSelectProps {
  label: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}

/** A compact menu-like select: picking an option applies it right away and the select resets. */
function BulkSelect({ label, disabled, options, onSelect, className }: BulkSelectProps & { className?: string }) {
  return (
    <select
      aria-label={label}
      value=""
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value) onSelect(event.target.value);
      }}
      className={cn(
        'h-8 max-w-[11rem] cursor-pointer appearance-none truncate rounded-lg border border-line-strong bg-raised pr-7 pl-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-overlay focus:border-accent-400 focus:ring-2 focus:ring-accent-500/25 focus:outline-none disabled:pointer-events-none disabled:opacity-50',
        'bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat',
        className,
      )}
      style={{ backgroundImage: CHEVRON }}
    >
      <option value="" disabled>
        {label}…
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236e6e7e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/** The checkbox shown in front of each row while selecting. */
export function RowSelectCheckbox({ title, selected, onToggle }: { title: string; selected: boolean; onToggle: (extend: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={t('Select “{title}”', { title })}
      checked={selected}
      onChange={() => {}}
      onClick={(event) => {
        // The row handles clicks too; this one must not count twice.
        event.stopPropagation();
        onToggle(event.shiftKey);
      }}
      className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-accent-500"
    />
  );
}

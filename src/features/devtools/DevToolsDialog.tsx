import { Bell, CalendarDays, Database, MessageSquare, Trash2, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import { addDueDateTestTask, addTestData, countTestData, DUE_DATE_TEST_CASES, removeTestData, type DueDateTestCase } from '../../domain/testData';
import { getNotificationSupport, sendNotification, type NotificationSupport } from '../../lib/desktop';
import { createId } from '../../lib/id';
import { usePreferences } from '../../state/preferencesContext';
import { useWorkspace, useWorkspaceActions, type SaveResult } from '../../state/workspaceContext';
import { DEV_TOOLS_SHORTCUT_LABEL } from './devToolsContext';

export const TEST_NOTIFICATIONS = [
  { label: 'Task reminder', message: { title: '[Test] Task due today', body: '“Fix jump buffering” is due today.' } },
  { label: 'Overdue task', message: { title: '[Test] Task overdue', body: '“Ship the save system” was due two days ago.' } },
  { label: 'Critical bug', message: { title: '[Test] Critical bug open', body: '“Crash when loading a save” is still unresolved.' } },
] as const;

const DUE_CASES = Object.keys(DUE_DATE_TEST_CASES) as DueDateTestCase[];

/**
 * A small internal tool for trying features without making real data by hand.
 * Everything it creates is marked "[Test]" and removable in one step; it has
 * no other way to change or delete data.
 */
export function DevToolsDialog({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspace();
  const { applyChange } = useWorkspaceActions();
  const { preferences } = usePreferences();
  const { showToast } = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const counts = countTestData(workspace);
  const support = getNotificationSupport();

  const report = (result: SaveResult, success: string) => {
    if (result.ok) showToast(success);
    else showToast(`Not saved: ${result.error.message}`, 'danger');
  };
  const context = () => ({ now: new Date(), createId });

  const notify = async (message: { title: string; body: string }) => {
    const shown = await sendNotification(message);
    if (!shown) showToast('The system did not show the notification. Check the Windows notification settings for VOID.', 'warning');
  };

  const generate = async () => report(await applyChange((ws) => addTestData(ws, context())), 'Test data added.');
  const remove = async () => {
    setConfirmRemove(false);
    report(await applyChange(removeTestData), `${counts.total} test ${counts.total === 1 ? 'item' : 'items'} removed.`);
  };
  const addDueTask = async (which: DueDateTestCase) =>
    report(await applyChange((ws) => addDueDateTestTask(ws, which, context())), `Test task “${DUE_DATE_TEST_CASES[which].label}” added.`);

  const testDataHint =
    counts.total === 0
      ? 'Adds a sample project with tasks, bugs, notes and snippets. Everything is marked “[Test]”.'
      : `${counts.total} test ${counts.total === 1 ? 'item' : 'items'} in this workspace. Removing deletes only items created here.`;

  return (
    <Dialog open onClose={onClose} title="Developer tools" description={`Try VOID's features without touching your real data. Shortcut: ${DEV_TOOLS_SHORTCUT_LABEL}.`}>
      <div className="space-y-5 text-[13px]">
        <Group icon={Bell} title="Test notifications" hint={notificationHint(support, preferences.notifications.enabled)}>
          {TEST_NOTIFICATIONS.map((item) => (
            <Button key={item.label} size="sm" onClick={() => void notify(item.message)}>
              {item.label}
            </Button>
          ))}
        </Group>

        <Group icon={Database} title="Test data" hint={testDataHint}>
          <Button size="sm" onClick={() => void generate()}>
            Generate test data
          </Button>
          {counts.total > 0 && !confirmRemove && (
            <Button size="sm" variant="ghost" icon={<Trash2 />} className="hover:text-danger" onClick={() => setConfirmRemove(true)}>
              Remove test data
            </Button>
          )}
          {counts.total > 0 && confirmRemove && (
            <>
              <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => void remove()}>
                Remove {counts.total} test {counts.total === 1 ? 'item' : 'items'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </>
          )}
        </Group>

        <Group icon={CalendarDays} title="Due dates" hint="Adds one “[Test]” task with that due date.">
          {DUE_CASES.map((which) => (
            <Button key={which} size="sm" onClick={() => void addDueTask(which)}>
              {DUE_DATE_TEST_CASES[which].label}
            </Button>
          ))}
        </Group>

        <Group icon={MessageSquare} title="UI messages" hint="Shows each kind of toast. Nothing is changed.">
          <Button size="sm" onClick={() => showToast('Test: this is a success message.')}>
            Success
          </Button>
          <Button size="sm" onClick={() => showToast('Test: this is a note.', 'info')}>
            Info
          </Button>
          <Button size="sm" onClick={() => showToast('Test: this is a warning.', 'warning')}>
            Warning
          </Button>
          <Button size="sm" onClick={() => showToast('Test: this is an error message.', 'danger')}>
            Error
          </Button>
          <Button
            size="sm"
            onClick={() =>
              showToast('Test: “Sample task” deleted.', 'success', {
                durationMs: 8000,
                action: { label: 'Undo', onAction: () => showToast('Test: Undo pressed. Nothing was deleted.') },
              })
            }
          >
            Undo toast
          </Button>
        </Group>
      </div>
    </Dialog>
  );
}

function notificationHint(support: NotificationSupport, enabled: boolean): string {
  const hints: Record<NotificationSupport, string> = {
    desktop: 'Sends a native Windows notification right away.',
    browser: 'Running in a browser: uses web notifications (the browser may ask first).',
    'browser-blocked': 'Notifications are blocked for this page in the browser settings.',
    unsupported: 'Notifications are not available here.',
  };
  return enabled ? hints[support] : `${hints[support]} Reminders are turned off in Settings; test notifications are sent anyway.`;
}

function Group({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon className="size-3.5 text-subtle" aria-hidden="true" />
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
      <p className="text-xs text-subtle">{hint}</p>
    </section>
  );
}

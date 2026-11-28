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
import { type MessageKey, t, tn } from '../../i18n/translate';

export const TEST_NOTIFICATIONS = [
  { labelKey: 'Task reminder', message: { title: '[Test] Task due today', body: '“Fix jump buffering” is due today.' } },
  { labelKey: 'Overdue task', message: { title: '[Test] Task overdue', body: '“Ship the save system” was due two days ago.' } },
  { labelKey: 'Critical bug', message: { title: '[Test] Critical bug open', body: '“Crash when loading a save” is still unresolved.' } },
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
    else showToast(t('Not saved: {reason}', { reason: result.error.message }), 'danger');
  };
  const context = () => ({ now: new Date(), createId });

  const notify = async (message: { title: string; body: string }) => {
    const shown = await sendNotification(message);
    if (!shown) showToast(t('The system did not show the notification. Check the Windows notification settings for VOID.'), 'warning');
  };

  const generate = async () => report(await applyChange((ws) => addTestData(ws, context())), t('Test data added.'));
  const remove = async () => {
    setConfirmRemove(false);
    report(await applyChange(removeTestData), tn('{count} test item removed.|{count} test items removed.', counts.total));
  };
  const addDueTask = async (which: DueDateTestCase) =>
    report(await applyChange((ws) => addDueDateTestTask(ws, which, context())), t('Test task “{label}” added.', { label: t(DUE_DATE_TEST_CASES[which].label as MessageKey) }));

  const testDataHint =
    counts.total === 0
      ? t('Adds a sample project with tasks, bugs, notes and snippets. Everything is marked “[Test]”.')
      : tn('{count} test item in this workspace. Removing deletes only items created here.|{count} test items in this workspace. Removing deletes only items created here.', counts.total);

  return (
    <Dialog open onClose={onClose} title={t('Developer tools')} description={t("Try VOID's features without touching your real data. Shortcut: {shortcut}.", { shortcut: DEV_TOOLS_SHORTCUT_LABEL })}>
      <div className="space-y-5 text-[13px]">
        <Group icon={Bell} title={t('Test notifications')} hint={notificationHint(support, preferences.notifications.enabled)}>
          {TEST_NOTIFICATIONS.map((item) => (
            <Button key={item.labelKey} size="sm" onClick={() => void notify(item.message)}>
              {t(item.labelKey)}
            </Button>
          ))}
        </Group>

        <Group icon={Database} title={t('Test data')} hint={testDataHint}>
          <Button size="sm" onClick={() => void generate()}>
            {t('Generate test data')}
          </Button>
          {counts.total > 0 && !confirmRemove && (
            <Button size="sm" variant="ghost" icon={<Trash2 />} className="hover:text-danger" onClick={() => setConfirmRemove(true)}>
              {t('Remove test data')}
            </Button>
          )}
          {counts.total > 0 && confirmRemove && (
            <>
              <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => void remove()}>
                {tn('Remove {count} test item|Remove {count} test items', counts.total)}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                {t('Cancel')}
              </Button>
            </>
          )}
        </Group>

        <Group icon={CalendarDays} title={t('Due dates')} hint={t('Adds one “[Test]” task with that due date.')}>
          {DUE_CASES.map((which) => (
            <Button key={which} size="sm" onClick={() => void addDueTask(which)}>
              {t(DUE_DATE_TEST_CASES[which].label as MessageKey)}
            </Button>
          ))}
        </Group>

        <Group icon={MessageSquare} title={t('UI messages')} hint={t('Shows each kind of toast. Nothing is changed.')}>
          <Button size="sm" onClick={() => showToast(t('Test: this is a success message.'))}>
            {t('Success')}
          </Button>
          <Button size="sm" onClick={() => showToast(t('Test: this is a note.'), 'info')}>
            {t('Info')}
          </Button>
          <Button size="sm" onClick={() => showToast(t('Test: this is a warning.'), 'warning')}>
            {t('Warning')}
          </Button>
          <Button size="sm" onClick={() => showToast(t('Test: this is an error message.'), 'danger')}>
            {t('Error')}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              showToast(t('Test: “Sample task” deleted.'), 'success', {
                durationMs: 8000,
                action: { label: t('Undo'), onAction: () => showToast(t('Test: Undo pressed. Nothing was deleted.')) },
              })
            }
          >
            {t('Undo toast')}
          </Button>
        </Group>
      </div>
    </Dialog>
  );
}

function notificationHint(support: NotificationSupport, enabled: boolean): string {
  const hints: Record<NotificationSupport, string> = {
    desktop: t('Sends a native Windows notification right away.'),
    browser: t('Running in a browser: uses web notifications (the browser may ask first).'),
    'browser-blocked': t('Notifications are blocked for this page in the browser settings.'),
    unsupported: t('Notifications are not available here.'),
  };
  return enabled ? hints[support] : t('{hint} Reminders are turned off in Settings; test notifications are sent anyway.', { hint: hints[support] });
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

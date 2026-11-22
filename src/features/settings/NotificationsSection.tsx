import { useId, type ReactNode } from 'react';

import { Badge } from '../../components/ui/Badge';
import { Toggle } from '../../components/ui/Toggle';
import { Input, Select } from '../../components/ui/Field';
import { REMINDER_LEAD_DAYS, REMINDER_TIME_PATTERN, type ReminderLeadDays, type ReminderSettings } from '../../domain/reminders';
import { getNotificationSupport } from '../../lib/desktop';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../state/preferencesContext';
import { SettingsSection } from './SettingsSection';

const LEAD_LABELS: Record<ReminderLeadDays, string> = { 0: 'No early reminder', 1: '1 day before', 2: '2 days before', 3: '3 days before', 7: '1 week before' };

/** Notification and tray settings. Everything runs locally: no internet, no push service. */
export function NotificationsSection() {
  const { preferences, updatePreferences } = usePreferences();
  const settings = preferences.notifications;
  const support = getNotificationSupport();
  const desktop = support === 'desktop';
  const set = (changes: Partial<ReminderSettings>) => updatePreferences((current) => ({ ...current, notifications: { ...current.notifications, ...changes } }));

  return (
    <SettingsSection title="Notifications" description="Desktop reminders for due tasks and important bugs. They are created on this device; no internet connection is needed.">
      <div className="space-y-4">
        {support === 'unsupported' && <p className="text-xs text-warning">Notifications are not available in this environment.</p>}
        {support === 'browser-blocked' && <p className="text-xs text-warning">Notifications are blocked for this page in the browser settings.</p>}
        <Toggle
          label="Desktop notifications"
          description="Turns all reminders on or off."
          checked={settings.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        <div className={cn('space-y-4 border-l border-line pl-4', !settings.enabled && 'opacity-50')}>
          <Toggle
            label="Task reminders"
            description="Tasks due today, overdue and coming up. Done tasks are never reminded."
            checked={settings.tasks}
            disabled={!settings.enabled}
            onChange={(tasks) => set({ tasks })}
          />
          <Toggle
            label="Bug reminders"
            description="Due dates of unresolved bugs, plus one reminder for each open critical bug."
            checked={settings.bugs}
            disabled={!settings.enabled}
            onChange={(bugs) => set({ bugs })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledControl label="Reminder time" hint="Each reminder is shown once, at or after this time.">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={settings.time}
                  disabled={!settings.enabled}
                  onChange={(event) => {
                    if (REMINDER_TIME_PATTERN.test(event.target.value)) set({ time: event.target.value });
                  }}
                  className="[color-scheme:dark]"
                />
              )}
            </LabeledControl>
            <LabeledControl label="Early reminder" hint="An extra reminder before the due date.">
              {(id) => (
                <Select
                  id={id}
                  value={String(settings.leadDays)}
                  disabled={!settings.enabled}
                  onChange={(event) => set({ leadDays: Number(event.target.value) as ReminderLeadDays })}
                >
                  {REMINDER_LEAD_DAYS.map((days) => (
                    <option key={days} value={days}>
                      {LEAD_LABELS[days]}
                    </option>
                  ))}
                </Select>
              )}
            </LabeledControl>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <Toggle
            label="Keep running in the notification area"
            description="Closing the window hides VOID next to the clock instead of quitting, so reminders keep coming. Quit from the tray icon."
            checked={preferences.keepInTray}
            disabled={!desktop}
            badge={desktop ? undefined : <Badge>Desktop app only</Badge>}
            onChange={(keepInTray) => updatePreferences((current) => ({ ...current, keepInTray }))}
          />
        </div>
        <p className="rounded-lg bg-raised px-3 py-2.5 text-xs leading-relaxed text-muted">
          Reminders appear while VOID is open, minimized{desktop ? ' or in the notification area' : ''}. When VOID is closed completely, nothing runs in the background, so
          nothing is shown; reminders that were missed appear the next time you open VOID. Each reminder is shown only once.
        </p>
      </div>
    </SettingsSection>
  );
}

function LabeledControl({ label, hint, children }: { label: string; hint: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children(id)}
      <p className="text-xs text-subtle">{hint}</p>
    </div>
  );
}

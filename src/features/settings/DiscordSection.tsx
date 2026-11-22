import { RefreshCw } from 'lucide-react';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { PRESENCE_ACTIVITIES, PRESENCE_STATUS_TEXT, describeConnection } from '../../domain/discordPresence';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../state/preferencesContext';
import { getDiscordSettings } from '../../storage/preferences';
import { useDiscordPresence } from '../discord/discordContext';
import { SettingRow, SettingsSection } from './SettingsSection';

/** Discord Rich Presence: on/off, elapsed time and the connection status. */
export function DiscordSection() {
  const { preferences, updatePreferences } = usePreferences();
  const settings = getDiscordSettings(preferences);
  const { available, state, reconnect } = useDiscordPresence();
  const set = (changes: Partial<typeof settings>) => updatePreferences((current) => ({ ...current, discord: { ...getDiscordSettings(current), ...changes } }));

  const connection = describeConnection(!available ? 'browser' : !settings.enabled ? 'disabled' : (state?.status ?? 'connecting'));
  const canRetry = available && settings.enabled && state?.status === 'unavailable';

  return (
    <SettingsSection title="Discord" description="Show in Discord that you are using VOID. Only a general status is shared, never your content.">
      <div className="space-y-4">
        <Toggle
          label="Discord Rich Presence"
          description="Shows your VOID status on your Discord profile while VOID is open."
          checked={settings.enabled}
          disabled={!available}
          onChange={(enabled) => set({ enabled })}
        />
        <div className={cn('border-l border-line pl-4', (!settings.enabled || !available) && 'opacity-50')}>
          <Toggle
            label="Show time used"
            description="Discord shows how long VOID has been open."
            checked={settings.showElapsed}
            disabled={!settings.enabled || !available}
            onChange={(showElapsed) => set({ showElapsed })}
          />
        </div>
        <dl className="divide-y divide-line border-t border-line pt-4">
          <SettingRow label="Connection">
            <span className="flex flex-wrap items-center justify-end gap-2" data-testid="discord-connection">
              <Badge tone={connection.tone}>{connection.label}</Badge>
              {canRetry && (
                <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={reconnect}>
                  Retry now
                </Button>
              )}
            </span>
          </SettingRow>
          {available && settings.enabled && state?.status === 'connected' && (
            <SettingRow label="Shown right now">
              <span className="font-medium">{state.statusText}</span>
            </SettingRow>
          )}
        </dl>
        <p className="text-xs text-subtle">{connection.detail}</p>
        <div className="rounded-lg bg-raised px-3 py-2.5 text-xs leading-relaxed text-muted">
          <p>Discord only ever sees one of these lines:</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESENCE_ACTIVITIES.map((activity) => (
              <li key={activity}>
                <Badge>{PRESENCE_STATUS_TEXT[activity]}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-1.5">
            No project names, code, notes, snippets, tasks, bugs or file paths. The connection goes to the Discord app on this PC only; VOID itself contacts no server.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

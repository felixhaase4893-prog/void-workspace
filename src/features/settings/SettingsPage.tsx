import { TerminalSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { NAVIGATION } from '../../app/navigation';
import { describeGlobalShortcuts } from '../../app/shortcuts';
import { Badge } from '../../components/ui/Badge';
import { Kbd } from '../../components/ui/Kbd';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { WORKSPACE_SCHEMA_VERSION } from '../../domain/models';
import { APP_VERSION } from '../../lib/appInfo';
import { formatBytes } from '../../lib/format';
import { useWorkspace, useWorkspaceContext } from '../../state/workspaceContext';
import { DEV_TOOLS_SHORTCUT_LABEL, useDevTools } from '../devtools/devToolsContext';
import { TagsSection } from '../tags/TagsSection';
import { BackupSection } from './BackupSection';
import { DiscordSection } from './DiscordSection';
import { LanguageSection } from './LanguageSection';
import { NotificationsSection } from './NotificationsSection';
import { ResetWorkspaceDialog } from './ResetWorkspaceDialog';
import { SearchHistorySection } from './SearchHistorySection';
import { SettingRow, SettingsSection } from './SettingsSection';
import { t } from '../../i18n/translate';

export function SettingsPage() {
  const workspace = useWorkspace();
  const { repository } = useWorkspaceContext();
  const [resetOpen, setResetOpen] = useState(false);
  const { openDevTools } = useDevTools();

  // localStorage stores UTF-16, so each character takes two bytes.
  const storedSize = (repository.readRaw()?.length ?? 0) * 2;
  const itemCount = workspace.projects.length + workspace.tasks.length + workspace.bugs.length + workspace.notes.length + workspace.snippets.length;

  return (
    <>
      <PageHeader title={t('Settings')} description={t('Your tags, reminders, Discord status, shortcuts, where your data lives and how to keep it safe.')} />
      <div className="space-y-8">
        <LanguageSection />

        <SettingsSection title={t('Storage')} description={t('VOID is local-first. Your data never leaves this device unless you export it.')}>
          <dl className="divide-y divide-line">
            <SettingRow label={t('Location')}>
              <span className="flex items-center gap-2">
                {repository.label}
                {!repository.persistent && <Badge tone="warning">{t('Not persistent')}</Badge>}
              </span>
            </SettingRow>
            <SettingRow label={t('Stored items')}>{itemCount}</SettingRow>
            <SettingRow label={t('Tags')}>{workspace.tags.length}</SettingRow>
            <SettingRow label={t('Size on disk')}>{formatBytes(storedSize)}</SettingRow>
            <SettingRow label={t('VOID version')}>
              <span className="font-mono">{APP_VERSION}</span>
            </SettingRow>
            <SettingRow label={t('Data format')}>
              <span className="font-mono">v{WORKSPACE_SCHEMA_VERSION}</span>
            </SettingRow>
          </dl>
          <p className="mt-4 rounded-lg bg-raised px-3 py-2.5 text-xs leading-relaxed text-muted">
            {t('Browser data is not synced between devices or browsers, and clearing site data deletes it. Export a backup regularly.')}
          </p>
        </SettingsSection>

        <TagsSection />

        <NotificationsSection />

        <DiscordSection />

        <SearchHistorySection />

        <SettingsSection title={t('Keyboard shortcuts')} description={t('Work without reaching for the mouse.')}>
          <dl className="divide-y divide-line">
            {describeGlobalShortcuts(NAVIGATION).map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <dt className="text-[13px] text-muted">{shortcut.description}</dt>
                <dd className="flex shrink-0 gap-1">
                  {shortcut.keys.split(' ').map((key) => (
                    <Kbd key={key} className="text-[11px] text-fg">
                      {key}
                    </Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </SettingsSection>

        <BackupSection />

        <SettingsSection title={t('Appearance')} description={t('VOID is designed dark-first.')}>
          <dl className="divide-y divide-line">
            <SettingRow label={t('Theme')}>{t('Dark')}</SettingRow>
            <SettingRow label={t('Light theme')}>
              <Badge>{t('Planned')}</Badge>
            </SettingRow>
          </dl>
        </SettingsSection>

        <SettingsSection title={t('Privacy')} description={t('What VOID does with your data.')}>
          <ul className="space-y-2 text-[13px] text-muted">
            <li>{t('No account and no cloud. Nothing is sent to a server.')}</li>
            <li>{t('No analytics, tracking or third-party scripts. Fonts are bundled with the app.')}</li>
            <li>{t('Reminders are created on this device. No push service is used.')}</li>
            <li>{t('Discord Rich Presence talks only to the Discord app on this PC and shares a general status, never your content.')}</li>
          </ul>
        </SettingsSection>

        <SettingsSection title={t('Developer')} description={t('Tools for trying features with test data.')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted">
              {t('Test notifications, generate and remove test data, preview messages. Shortcut:')} <kbd className="font-mono text-xs text-fg">{DEV_TOOLS_SHORTCUT_LABEL}</kbd>
            </p>
            <Button icon={<TerminalSquare />} onClick={openDevTools}>
              {t('Developer tools')}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title={t('Danger zone')} description={t('Irreversible actions.')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted">{t('Delete all workspace data from this device.')}</p>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setResetOpen(true)}>
              {t('Delete all data')}
            </Button>
          </div>
        </SettingsSection>
      </div>
      <ResetWorkspaceDialog open={resetOpen} onClose={() => setResetOpen(false)} />
    </>
  );
}

import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';

import { ToastProvider } from '../components/ui/ToastProvider';
import { BugsPage } from '../features/bugs/BugsPage';
import { CodeTesterSessionProvider } from '../features/codetester/CodeTesterSessionProvider';
import { EntityDialogProvider } from '../features/create/EntityDialogProvider';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DevToolsProvider } from '../features/devtools/DevToolsProvider';
import { DiscordPresenceProvider } from '../features/discord/DiscordPresenceProvider';
import { ListFiltersProvider } from '../features/filters/ListFiltersProvider';
import { NotesPage } from '../features/notes/NotesPage';
import { ReminderScheduler } from '../features/notifications/ReminderScheduler';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { QuickAddProvider } from '../features/quickadd/QuickAddProvider';
import { SearchProvider } from '../features/search/SearchProvider';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SnippetsPage } from '../features/snippets/SnippetsPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { AppLayout } from '../layouts/AppLayout';
import { Spinner } from '../components/ui/Spinner';
import type { StorageError } from '../storage/errors';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { PreferencesRepository } from '../storage/preferences';
import type { WorkspaceRepository } from '../storage/workspaceRepository';
import { PreferencesProvider } from '../state/PreferencesProvider';
import { WorkspaceProvider } from '../state/WorkspaceProvider';
import { DocumentTitle } from './DocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { WorkspaceGate } from './WorkspaceGate';
import { I18nBoundary, RemountOnLanguageChange } from '../i18n/I18nBoundary';
import { t } from '../i18n/translate';

// The Code Tester and the statistics page load their code (editor, parsers, charts) only when opened.
const loadCodeTester = () => import('../features/codetester/CodeTesterPage');
const loadStatistics = () => import('../features/statistics/StatisticsPage');
const CodeTesterPage = lazy(loadCodeTester);
const StatisticsPage = lazy(loadStatistics);
// The optimizer is opened rarely; its code loads only when the page is visited.
const OptimizerPage = lazy(() => import('../features/optimizer/OptimizerPage'));

/** Once the app has settled, load those pages in the background, so Ctrl+8 / Ctrl+9 open without a spinner. */
export const PREFETCH_DELAY_MS = 3000;

function PrefetchPages() {
  useEffect(() => {
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      const run = () => void Promise.all([loadCodeTester(), loadStatistics()]).catch(() => {});
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run, { timeout: 2000 });
      else run();
    }, PREFETCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, []);
  return null;
}

function PageLoader({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-3 py-16 text-[13px] text-muted" role="status">
          <Spinner /> {t('Loading…')}
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

interface AppProps {
  repository: WorkspaceRepository;
  storageWarning?: StorageError | null;
  /** Notification and tray settings. Tests get an in-memory store unless they pass their own. */
  preferences?: PreferencesRepository;
}

/** The app without a router, so tests can wrap it in a MemoryRouter. */
export function App({ repository, storageWarning = null, preferences }: AppProps) {
  const [fallbackPreferences] = useState(() => new PreferencesRepository(new MemoryKeyValueStore()));
  return (
    <WorkspaceProvider repository={repository} storageWarning={storageWarning}>
      <PreferencesProvider repository={preferences ?? fallbackPreferences}>
        <I18nBoundary>
        <WorkspaceGate>
          <ToastProvider>
            <EntityDialogProvider>
              <SearchProvider>
                <QuickAddProvider>
                  <ListFiltersProvider>
                    <DevToolsProvider>
                      <CodeTesterSessionProvider>
                      <DiscordPresenceProvider>
                      <RemountOnLanguageChange>
                      <DocumentTitle />
                      <PrefetchPages />
                      <ReminderScheduler />
                      <Routes>
                        <Route element={<AppLayout />}>
                          <Route index element={<DashboardPage />} />
                          <Route path="projects" element={<ProjectsPage />} />
                          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
                          <Route path="tasks" element={<TasksPage />} />
                          <Route path="bugs" element={<BugsPage />} />
                          <Route path="notes" element={<NotesPage />} />
                          <Route path="snippets" element={<SnippetsPage />} />
                          <Route path="code-tester" element={<PageLoader><CodeTesterPage /></PageLoader>} />
                          <Route path="statistics" element={<PageLoader><StatisticsPage /></PageLoader>} />
                          <Route path="optimizer" element={<PageLoader><OptimizerPage /></PageLoader>} />
                          <Route path="settings" element={<SettingsPage />} />
                          <Route path="*" element={<NotFoundPage />} />
                        </Route>
                      </Routes>
                      </RemountOnLanguageChange>
                      </DiscordPresenceProvider>
                      </CodeTesterSessionProvider>
                    </DevToolsProvider>
                  </ListFiltersProvider>
                </QuickAddProvider>
              </SearchProvider>
            </EntityDialogProvider>
          </ToastProvider>
        </WorkspaceGate>
        </I18nBoundary>
      </PreferencesProvider>
    </WorkspaceProvider>
  );
}

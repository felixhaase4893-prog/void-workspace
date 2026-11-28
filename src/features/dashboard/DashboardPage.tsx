import { LayoutDashboard, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { groupDashboardCards, visibleDashboardCards, type DashboardCardId } from '../../domain/dashboardLayout';
import type { Workspace } from '../../domain/models';
import { isWorkspaceEmpty } from '../../domain/workspace';
import { useToday } from '../../hooks/useToday';
import { getGreeting } from '../../lib/format';
import { markStartup } from '../../lib/startupMarks';
import { useWorkspace } from '../../state/workspaceContext';
import { CustomizeDashboardDialog } from './CustomizeDashboardDialog';
import { DueSoon } from './DueSoon';
import { ProjectsOverview } from './ProjectsOverview';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';
import { StatisticsCard } from './StatisticsCard';
import { StatTiles } from './StatTiles';
import { useDashboardLayout } from './useDashboardLayout';
import { WelcomePanel } from './WelcomePanel';
import { dateTimeFormat, t } from '../../i18n/translate';


function renderCard(card: DashboardCardId, workspace: Workspace, today: string): ReactNode {
  switch (card) {
    case 'stats':
      return <StatTiles workspace={workspace} />;
    case 'statistics':
      return <StatisticsCard workspace={workspace} today={today} />;
    case 'quickActions':
      return <QuickActions />;
    case 'dueSoon':
      return <DueSoon workspace={workspace} today={today} />;
    case 'recent':
      return <RecentActivity workspace={workspace} />;
    case 'projects':
      return <ProjectsOverview workspace={workspace} />;
  }
}

export function DashboardPage() {
  const workspace = useWorkspace();
  const today = useToday();
  const now = new Date();
  const empty = isWorkspaceEmpty(workspace);
  const { layout } = useDashboardLayout();
  const [customizing, setCustomizing] = useState(false);
  useEffect(() => markStartup('void:dashboard-ready'), []);

  const cards = visibleDashboardCards(layout);
  const customizeButton = (
    <Button size="sm" icon={<SlidersHorizontal />} onClick={() => setCustomizing(true)}>
      {t('Customize')}
    </Button>
  );

  return (
    <>
      <PageHeader
        eyebrow={dateTimeFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
        title={getGreeting(now)}
        description={empty ? t('Welcome to VOID, the organised side of your dev life.') : t('Here is where your work stands.')}
        actions={empty ? undefined : customizeButton}
      />
      {empty ? (
        <WelcomePanel />
      ) : cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutDashboard}
            title={t('All dashboard cards are hidden')}
            description={t('Pick the cards you want to see again, or restore the default layout.')}
            action={customizeButton}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groupDashboardCards(cards).map((group) =>
            group.wide ? (
              group.cards.map((card) => <div key={card}>{renderCard(card, workspace, today)}</div>)
            ) : (
              <div key={group.cards.join('+')} className="grid items-start gap-5 lg:grid-cols-2">
                {group.cards.map((card) => (
                  <div key={card} className="min-w-0">
                    {renderCard(card, workspace, today)}
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      )}
      {customizing && <CustomizeDashboardDialog onClose={() => setCustomizing(false)} />}
    </>
  );
}

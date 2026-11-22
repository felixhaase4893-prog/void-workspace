import { ListChecks, Plus, SquareCheckBig } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PlannedFeatures } from '../../components/ui/PlannedFeatures';
import { getProjectName, isOpenTask } from '../../domain/workspace';
import { useWorkspace } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { FilterBar, NoMatches } from '../filters/FilterBar';
import { useListFilters } from '../filters/listFiltersContext';
import { SelectionBar } from '../selection/SelectionBar';
import { useSelection } from '../selection/useSelection';
import { TaskRow } from './TaskRow';

export function TasksPage() {
  const workspace = useWorkspace();
  const { openCreateDialog } = useEntityDialogs();
  const filter = useListFilters('task');
  const visibleIds = useMemo(() => filter.visible.map((item) => item.id), [filter.visible]);
  const selection = useSelection(visibleIds);
  const openCount = workspace.tasks.filter(isOpenTask).length;
  const description =
    workspace.tasks.length === 0
      ? 'What needs doing across all of your projects.'
      : openCount === 0
        ? 'No open tasks. Everything on your list is done.'
        : `${openCount} open across all of your projects.`;

  const selectButton = (
    <Button icon={<SquareCheckBig />} onClick={selection.start} title="Select several to change or delete them together">
      Select
    </Button>
  );

  const newButton = (
    <Button variant="primary" icon={<Plus />} onClick={() => openCreateDialog('task')}>
      New task
    </Button>
  );

  return (
    <>
      <PageHeader title="Tasks" description={description} actions={
          workspace.tasks.length > 0 ? (
            <>
              {!selection.active && selectButton}
              {newButton}
            </>
          ) : undefined
        } />
      {workspace.tasks.length === 0 ? (
        <Card>
          <EmptyState icon={ListChecks} title="No tasks yet" description="Add tasks for features, chores and anything else on your list." action={newButton} quickAddHint />
        </Card>
      ) : (
        <>
          <FilterBar state={filter} />
          {selection.active && <SelectionBar type="task" selection={selection} visibleCount={visibleIds.length} />}
          <Card>
            {filter.visible.length === 0 ? (
              <NoMatches state={filter} />
            ) : (
              <ul className="divide-y divide-line">
                {filter.visible.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectName={getProjectName(workspace, task.projectId)}
                    selection={selection.active ? { selected: selection.isSelected(task.id), onToggle: (extend) => selection.toggle(task.id, extend) } : undefined}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      <PlannedFeatures items={['Board view with “In progress” column']} />
    </>
  );
}

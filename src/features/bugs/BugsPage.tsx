import { Bug as BugIcon, Plus, SquareCheckBig } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { getProjectName } from '../../domain/workspace';
import { useWorkspace } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { FilterBar, NoMatches } from '../filters/FilterBar';
import { useListFilters } from '../filters/listFiltersContext';
import { SelectionBar } from '../selection/SelectionBar';
import { useSelection } from '../selection/useSelection';
import { BugRow } from './BugRow';

/** A lean bug list for one developer: filter by status, priority, due date, project and tags; fixed bugs stay visible. */
export function BugsPage() {
  const workspace = useWorkspace();
  const { openCreateDialog } = useEntityDialogs();
  const filter = useListFilters('bug');
  const visibleIds = useMemo(() => filter.visible.map((item) => item.id), [filter.visible]);
  const selection = useSelection(visibleIds);
  const open = workspace.bugs.filter((bug) => bug.status === 'open' || bug.status === 'in_progress').length;

  const selectButton = (
    <Button icon={<SquareCheckBig />} onClick={selection.start} title="Select several to change or delete them together">
      Select
    </Button>
  );

  const newButton = (
    <Button variant="primary" icon={<Plus />} onClick={() => openCreateDialog('bug')}>
      New bug
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Bugs"
        description={workspace.bugs.length === 0 ? 'Keep track of what is broken, project by project.' : `${open} unresolved. Fixed and closed bugs stay here for reference.`}
        actions={
          workspace.bugs.length > 0 ? (
            <>
              {!selection.active && selectButton}
              {newButton}
            </>
          ) : undefined
        }
      />
      {workspace.bugs.length === 0 ? (
        <Card>
          <EmptyState icon={BugIcon} title="No bugs yet" description="Log bugs with a priority and an optional due date, and link them to a project." action={newButton} quickAddHint />
        </Card>
      ) : (
        <>
          <FilterBar state={filter} />
          {selection.active && <SelectionBar type="bug" selection={selection} visibleCount={visibleIds.length} />}
          <Card>
            {filter.visible.length === 0 ? (
              <NoMatches state={filter} />
            ) : (
              <ul className="divide-y divide-line">
                {filter.visible.map((bug) => (
                  <BugRow
                    key={bug.id}
                    bug={bug}
                    projectName={getProjectName(workspace, bug.projectId)}
                    selection={selection.active ? { selected: selection.isSelected(bug.id), onToggle: (extend) => selection.toggle(bug.id, extend) } : undefined}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}

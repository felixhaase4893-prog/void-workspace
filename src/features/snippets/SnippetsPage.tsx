import { Code2, Plus } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PlannedFeatures } from '../../components/ui/PlannedFeatures';
import { getProjectName } from '../../domain/workspace';
import { useWorkspace } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { FilterBar, NoMatches } from '../filters/FilterBar';
import { useListFilters } from '../filters/listFiltersContext';
import { SnippetCard } from './SnippetCard';

export function SnippetsPage() {
  const workspace = useWorkspace();
  const { snippets } = workspace;
  const { openCreateDialog } = useEntityDialogs();
  const filter = useListFilters('snippet');

  const newButton = (
    <Button variant="primary" icon={<Plus />} onClick={() => openCreateDialog('snippet')}>
      New snippet
    </Button>
  );

  return (
    <>
      <PageHeader title="Snippet Vault" description="Reusable code you reach for again and again." actions={snippets.length > 0 ? newButton : undefined} />
      {snippets.length === 0 ? (
        <Card>
          <EmptyState icon={Code2} title="Your vault is empty" description="Save hooks, Luau modules, shaders or shell one-liners so you never rewrite them." action={newButton} quickAddHint />
        </Card>
      ) : (
        <>
          <FilterBar state={filter} />
          {filter.visible.length === 0 ? (
            <Card>
              <NoMatches state={filter} />
            </Card>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {filter.visible.map((snippet) => (
                <li key={snippet.id} className="min-w-0">
                  <SnippetCard snippet={snippet} projectName={getProjectName(workspace, snippet.projectId)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <PlannedFeatures items={['Variables / placeholders in snippets']} />
    </>
  );
}

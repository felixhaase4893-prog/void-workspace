import { Plus, StickyNote } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { getProjectName } from '../../domain/workspace';
import { useWorkspace } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { FilterBar, NoMatches } from '../filters/FilterBar';
import { useListFilters } from '../filters/listFiltersContext';
import { NoteCard } from './NoteCard';

export function NotesPage() {
  const workspace = useWorkspace();
  const { openCreateDialog } = useEntityDialogs();
  const filter = useListFilters('note');
  const now = new Date();

  const newButton = (
    <Button variant="primary" icon={<Plus />} onClick={() => openCreateDialog('note')}>
      New note
    </Button>
  );

  return (
    <>
      <PageHeader title="Notes" description="Technical notes, decisions and things you will forget otherwise." actions={workspace.notes.length > 0 ? newButton : undefined} />
      {workspace.notes.length === 0 ? (
        <Card>
          <EmptyState icon={StickyNote} title="No notes yet" description="Write down architecture ideas, API quirks or the reason behind a decision." action={newButton} quickAddHint />
        </Card>
      ) : (
        <>
          <FilterBar state={filter} />
          {filter.visible.length === 0 ? (
            <Card>
              <NoMatches state={filter} />
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filter.visible.map((note) => (
                <li key={note.id} className="min-w-0">
                  <NoteCard note={note} projectName={getProjectName(workspace, note.projectId)} now={now} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

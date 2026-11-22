import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button, IconButton } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { tagKey, type Tag } from '../../domain/models';
import { countTagUsage, sortTagsByName } from '../../domain/tags';
import { useWorkspace } from '../../state/workspaceContext';
import { SettingsSection } from '../settings/SettingsSection';
import { DeleteTagDialog } from './DeleteTagDialog';
import { TagChip } from './TagChip';
import { TagDialog } from './TagDialog';
import { describeUsage } from './usageText';

/** From this many tags on, a filter field helps to find one. */
const FILTER_THRESHOLD = 8;

type Editing = { mode: 'create' } | { mode: 'edit'; tag: Tag } | { mode: 'delete'; tag: Tag };

/** Central place to create, rename, recolour and delete tags. */
export function TagsSection() {
  const workspace = useWorkspace();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [filter, setFilter] = useState('');

  // Counted once per data change, not per row.
  const usage = useMemo(() => countTagUsage(workspace), [workspace]);
  const sorted = useMemo(() => sortTagsByName(workspace.tags), [workspace.tags]);
  const filterKey = tagKey(filter);
  const visible = filterKey === '' ? sorted : sorted.filter((tag) => tagKey(tag.name).includes(filterKey));
  const close = () => setEditing(null);

  return (
    <SettingsSection title="Tags" description="Your own labels for projects, tasks, notes and snippets. Rename or recolour them here; every item keeps its tags.">
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-6 text-center">
          <Tags className="mb-3 size-5 text-accent-300" aria-hidden="true" />
          <p className="text-[13px] font-medium text-fg">No tags yet</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
            Create tags like Frontend, Bug or Later here, or right inside any form while you add or edit an item.
          </p>
          <Button size="sm" icon={<Plus />} className="mt-4" onClick={() => setEditing({ mode: 'create' })}>
            New tag
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted">
              {sorted.length} {sorted.length === 1 ? 'tag' : 'tags'}
            </p>
            <div className="flex gap-2">
              {sorted.length >= FILTER_THRESHOLD && (
                <div className="relative min-w-0 flex-1 sm:w-48 sm:flex-none">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
                  <Input aria-label="Find a tag" placeholder="Find a tag" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-8 pl-8 text-[13px]" />
                </div>
              )}
              <Button size="sm" icon={<Plus />} onClick={() => setEditing({ mode: 'create' })}>
                New tag
              </Button>
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">No tag matches “{filter.trim()}”.</p>
          ) : (
            <ul aria-label="All tags" className="scrollbar-thin -mx-2 max-h-[28rem] divide-y divide-line overflow-y-auto">
              {visible.map((tag) => {
                const tagUsage = usage.get(tag.id);
                const total = tagUsage?.total ?? 0;
                return (
                  <li key={tag.id} className="flex items-center gap-3 px-2 py-2">
                    <div className="min-w-0 flex-1">
                      <TagChip name={tag.name} color={tag.color} className="max-w-full" />
                      <p className="mt-1 truncate text-xs text-subtle">
                        {total === 0 ? 'Not used yet' : `${total} ${total === 1 ? 'use' : 'uses'} · ${tagUsage ? describeUsage(tagUsage) : ''}`}
                      </p>
                    </div>
                    <IconButton label={`Edit tag ${tag.name}`} onClick={() => setEditing({ mode: 'edit', tag })}>
                      <Pencil />
                    </IconButton>
                    <IconButton label={`Delete tag ${tag.name}`} className="hover:text-danger" onClick={() => setEditing({ mode: 'delete', tag })}>
                      <Trash2 />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {editing?.mode === 'create' && <TagDialog onClose={close} />}
      {editing?.mode === 'edit' && <TagDialog key={editing.tag.id} tag={editing.tag} usageCount={usage.get(editing.tag.id)?.total ?? 0} onClose={close} />}
      {editing?.mode === 'delete' && <DeleteTagDialog tag={editing.tag} usage={usage.get(editing.tag.id)} onClose={close} />}
    </SettingsSection>
  );
}

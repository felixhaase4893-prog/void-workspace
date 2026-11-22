import { useLayoutEffect, useRef, useState } from 'react';

import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import type { Note } from '../../domain/models';
import { cn } from '../../lib/cn';
import { formatRelativeTime } from '../../lib/format';
import { ItemActions } from '../create/ItemActions';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { TagList } from '../tags/TagList';
import { MarkdownView } from './MarkdownView';

export function NoteCard({ note, projectName = null, now }: { note: Note; projectName?: string | null; now: Date }) {
  return (
    <Card className="flex h-full min-w-0 flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold text-fg">{note.title}</h2>
        <div className="-mt-1.5 -mr-2 flex shrink-0 items-center">
          <FavoriteButton type="note" id={note.id} title={note.title} favorite={note.favorite} />
          <ItemActions type="note" id={note.id} title={note.title} />
        </div>
      </div>
      {note.content.trim() ? (
        // Long notes fade out at the bottom; the full note is in the edit dialog's preview.
        <NotePreview content={note.content} />
      ) : (
        <p className="mt-1 flex-1 text-[13px] text-subtle">Empty note</p>
      )}
      <TagList tagIds={note.tagIds} max={5} className="mt-3" />
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-subtle">
        {projectName ? <Badge className="min-w-0 max-w-full"><span className="truncate">{projectName}</span></Badge> : <span />}
        <time dateTime={note.updatedAt}>{formatRelativeTime(note.updatedAt, now)}</time>
      </div>
    </Card>
  );
}

/** Formatted note content, cut off after a few lines; only overflowing notes fade out at the bottom. */
function NotePreview({ content }: { content: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content]);

  return (
    <div
      ref={box}
      className={cn('relative mt-1 max-h-44 min-w-0 flex-1 overflow-hidden', overflowing && '[mask-image:linear-gradient(to_bottom,black_70%,transparent)]')}
    >
      <MarkdownView source={content} compact />
    </div>
  );
}

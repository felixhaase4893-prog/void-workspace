import { cn } from '../../lib/cn';
import { HighlightedText } from '../search/HighlightedText';
import { TagChip } from './TagChip';
import { useItemTags } from './useTags';

interface TagListProps {
  tagIds: readonly string[] | undefined;
  /** Show at most this many tags and a "+N" chip for the rest. */
  max?: number;
  /** Search terms: matching tags come first and are highlighted. */
  terms?: readonly string[];
  className?: string;
}

/** The tags of one item. Renders nothing for items without tags, so no empty gaps appear. */
export function TagList({ tagIds, max, terms, className }: TagListProps) {
  let tags = useItemTags(tagIds);
  if (tags.length === 0) return null;

  if (terms && terms.length > 0) {
    const matches = (name: string) => terms.some((term) => name.toLowerCase().includes(term));
    tags = [...tags.filter((tag) => matches(tag.name)), ...tags.filter((tag) => !matches(tag.name))];
  }
  const visible = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - visible.length;

  return (
    <ul aria-label="Tags" className={cn('flex min-w-0 flex-wrap gap-1', className)}>
      {visible.map((tag) => (
        <li key={tag.id} className="min-w-0">
          <TagChip name={tag.name} color={tag.color}>
            {terms ? <HighlightedText text={tag.name} terms={terms} /> : undefined}
          </TagChip>
        </li>
      ))}
      {hidden > 0 && (
        <li title={tags.slice(visible.length).map((tag) => tag.name).join(', ')}>
          <span className="inline-flex h-5 items-center rounded-md border border-line px-1.5 text-[11px] text-subtle">
            +{hidden}
            <span className="sr-only"> more {hidden === 1 ? 'tag' : 'tags'}</span>
          </span>
        </li>
      )}
    </ul>
  );
}

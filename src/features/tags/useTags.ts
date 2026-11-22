import { useMemo } from 'react';

import { createTagLookup, getTagsFor, type TagLookup } from '../../domain/tags';
import type { Tag } from '../../domain/models';
import { useWorkspace } from '../../state/workspaceContext';

/** Tag id → tag, rebuilt only when the tag list itself changes. */
export function useTagLookup(): TagLookup {
  const { tags } = useWorkspace();
  return useMemo(() => createTagLookup(tags), [tags]);
}

/** The current tags of an item; renamed or deleted tags are always up to date. */
export function useItemTags(tagIds: readonly string[] | undefined): Tag[] {
  const lookup = useTagLookup();
  return useMemo(() => getTagsFor(lookup, tagIds), [lookup, tagIds]);
}

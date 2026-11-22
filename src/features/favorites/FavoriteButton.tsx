import { Star } from 'lucide-react';
import type { MouseEvent } from 'react';

import { Button } from '../../components/ui/Button';
import type { EntityType } from '../../domain/models';
import { cn } from '../../lib/cn';
import { useWorkspaceActions } from '../../state/workspaceContext';

interface FavoriteButtonProps {
  type: EntityType;
  id: string;
  /** Used for the accessible name, e.g. "Add Obby Rush to favorites". */
  title: string;
  favorite: boolean;
  className?: string;
}

/**
 * Star toggle for one item. Filled star = favourite, outline = not, so the
 * state never depends on colour alone; screen readers get `aria-pressed`.
 */
export function FavoriteButton({ type, id, title, favorite, className }: FavoriteButtonProps) {
  const { setFavorite } = useWorkspaceActions();
  const label = favorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`;

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    // Cards may be links or sit inside clickable areas; a star click must only toggle the star.
    event.preventDefault();
    event.stopPropagation();
    void setFavorite(type, id, !favorite);
  };

  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={label}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={toggle}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:outline-none [&_svg]:size-4',
        favorite ? 'text-accent-300 hover:text-accent-200' : 'text-subtle hover:text-fg',
        className,
      )}
    >
      <Star fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

/** The same toggle with a visible label, for detail pages where there is room for it. */
export function FavoriteToggle({ type, id, title, favorite, className }: FavoriteButtonProps) {
  const { setFavorite } = useWorkspaceActions();
  return (
    <Button
      aria-pressed={favorite}
      aria-label={favorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
      icon={<Star fill={favorite ? 'currentColor' : 'none'} />}
      className={cn(favorite && 'text-accent-200', className)}
      onClick={() => void setFavorite(type, id, !favorite)}
    >
      {favorite ? 'Favorite' : 'Add to favorites'}
    </Button>
  );
}

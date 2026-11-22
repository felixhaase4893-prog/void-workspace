import { Pencil, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import type { EntityType } from '../../domain/models';
import { useEntityDialogs, type DeleteDialogOptions } from './entityDialogContext';

interface ItemActionsProps {
  type: EntityType;
  id: string;
  /** Used for the buttons' accessible names, e.g. "Edit Obby Rush". */
  title: string;
  deleteOptions?: DeleteDialogOptions;
  className?: string;
}

/** Edit and delete buttons for one item. */
export function ItemActions({ type, id, title, deleteOptions, className }: ItemActionsProps) {
  const { openEditDialog, openDeleteDialog } = useEntityDialogs();
  return (
    <div className={cn('flex shrink-0 items-center', className)}>
      <IconButton label={`Edit ${title}`} className="size-8 [&_svg]:size-4" onClick={() => openEditDialog(type, id)}>
        <Pencil />
      </IconButton>
      <IconButton
        label={`Delete ${title}`}
        className="size-8 hover:text-danger [&_svg]:size-4"
        onClick={() => openDeleteDialog(type, id, deleteOptions)}
      >
        <Trash2 />
      </IconButton>
    </div>
  );
}

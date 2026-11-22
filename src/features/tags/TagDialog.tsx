import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/toastContext';
import { MAX_TAG_NAME_LENGTH, TAG_COLORS, normalizeTagName, type Tag, type TagColor } from '../../domain/models';
import { isTagError, validateTagName } from '../../domain/tags';
import { cn } from '../../lib/cn';
import { useWorkspace, useWorkspaceActions } from '../../state/workspaceContext';
import { TagChip } from './TagChip';
import { TAG_COLOR_LABELS, TAG_SWATCH_CLASSES } from './tagColors';

interface TagDialogProps {
  /** Without a tag the dialog creates one. */
  tag?: Tag | undefined;
  /** How many items use the tag, shown as a reassurance when renaming. */
  usageCount?: number;
  onClose: () => void;
}

const COLOR_CHOICES: Array<TagColor | null> = [null, ...TAG_COLORS];

export function TagDialog({ tag, usageCount = 0, onClose }: TagDialogProps) {
  const { tags } = useWorkspace();
  const { createTag, updateTag } = useWorkspaceActions();
  const { showToast } = useToast();
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState<TagColor | null>(tag?.color ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const valid = validateTagName(tags, name, tag?.id ?? null);
    if (!valid.ok) {
      setError(valid.error.message);
      return;
    }
    setPending(true);
    const input = { name: valid.value, color };
    const result = tag ? await updateTag(tag.id, input) : await createTag(input);
    setPending(false);
    if (!result.ok) {
      // Refused before saving (e.g. a name taken meanwhile): keep the dialog open.
      if (isTagError(result.error)) {
        setError(result.error.message);
        return;
      }
      showToast(`Not saved: ${result.error.message}`, 'danger');
    } else {
      showToast(tag ? 'Tag updated.' : `Tag “${valid.value}” created.`);
    }
    onClose();
  };

  const preview = normalizeTagName(name) || 'Tag name';

  return (
    <Dialog open onClose={onClose} title={tag ? 'Edit tag' : 'New tag'} description={tag ? undefined : 'Use tags to group anything: Frontend, Bug, Idea, Later…'}>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field
          label="Name"
          error={error ?? undefined}
          hint={tag && usageCount > 0 ? `Renaming keeps the tag on all ${usageCount} ${usageCount === 1 ? 'item' : 'items'}.` : `Up to ${MAX_TAG_NAME_LENGTH} characters.`}
        >
          {(field) => (
            <Input
              {...field}
              data-autofocus
              value={name}
              maxLength={MAX_TAG_NAME_LENGTH * 2}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="e.g. Performance"
              autoComplete="off"
            />
          )}
        </Field>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-fg">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_CHOICES.map((choice) => {
              const key = choice ?? 'default';
              const checked = color === choice;
              return (
                <label key={key} title={TAG_COLOR_LABELS[key]} className="relative cursor-pointer">
                  <input type="radio" name="tag-color" className="peer sr-only" checked={checked} onChange={() => setColor(choice)} aria-label={TAG_COLOR_LABELS[key]} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-7 place-items-center rounded-full border-2 border-transparent transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-400',
                      checked ? 'border-fg/70' : 'hover:border-line-strong',
                    )}
                  >
                    <span className={cn('grid size-5 place-items-center rounded-full', TAG_SWATCH_CLASSES[key])}>
                      {checked && <Check className="size-3 text-canvas" strokeWidth={3} />}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center gap-2 rounded-lg bg-raised px-3 py-2.5 text-xs text-subtle">
          Preview <TagChip name={preview} color={color} />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : tag ? 'Save changes' : 'Create tag'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

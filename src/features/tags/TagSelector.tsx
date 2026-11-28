import { Plus, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

import { Field } from '../../components/ui/Field';
import { MAX_TAG_NAME_LENGTH, MAX_TAGS_PER_ITEM, normalizeTagName, tagKey, type Tag, type TagSelection } from '../../domain/models';
import { findTagByName, sortTagsByName } from '../../domain/tags';
import { cn } from '../../lib/cn';
import { useWorkspace } from '../../state/workspaceContext';
import { TagChip } from './TagChip';
import { useTagLookup } from './useTags';
import { t, tn } from '../../i18n/translate';

/** Suggestions shown at once; typing narrows the list down further. */
const MAX_SUGGESTIONS = 50;

type Option = { kind: 'existing'; tag: Tag } | { kind: 'create'; name: string };

interface TagFieldProps {
  value: TagSelection[];
  error?: string | undefined;
  onChange: (value: TagSelection[]) => void;
}

/** The one tag picker used by every form. Changes only reach the data when the form is saved. */
export function TagField({ value, error, onChange }: TagFieldProps) {
  return (
    <Field label={t('Tags')} optional error={error} hint={t('Type to find a tag or create a new one. Enter adds it.')}>
      {(field) => <TagSelector value={value} onChange={onChange} inputProps={field} />}
    </Field>
  );
}

interface TagSelectorProps {
  value: TagSelection[];
  onChange: (value: TagSelection[]) => void;
  inputProps: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined };
}

interface SelectedTag {
  key: string;
  index: number;
  name: string;
  tag: Tag | null;
}

export function TagSelector({ value, onChange, inputProps }: TagSelectorProps) {
  const { tags } = useWorkspace();
  const lookup = useTagLookup();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  // What is selected, as shown in the chips. Ids of tags deleted meanwhile are hidden and dropped on save.
  const selected = useMemo<SelectedTag[]>(
    () =>
      value.flatMap((choice, index): SelectedTag[] => {
        if ('id' in choice) {
          const tag = lookup.get(choice.id);
          return tag ? [{ key: `id:${tag.id}`, index, name: tag.name, tag }] : [];
        }
        return [{ key: `new:${tagKey(choice.name)}`, index, name: choice.name, tag: null }];
      }),
    [value, lookup],
  );
  const selectedKeys = useMemo(() => new Set(selected.map((item) => tagKey(item.name))), [selected]);
  const atLimit = selected.length >= MAX_TAGS_PER_ITEM;

  const name = normalizeTagName(text);
  const key = name.toLowerCase();
  const tooLong = name.length > MAX_TAG_NAME_LENGTH;

  const { options, more } = useMemo(() => {
    const available = tags.filter((tag) => !selectedKeys.has(tagKey(tag.name)));
    const matching =
      key === ''
        ? sortTagsByName(available)
        : sortTagsByName(available.filter((tag) => tagKey(tag.name).includes(key))).sort(
            (a, b) => Number(tagKey(b.name).startsWith(key)) - Number(tagKey(a.name).startsWith(key)),
          );
    const list: Option[] = matching.slice(0, MAX_SUGGESTIONS).map((tag) => ({ kind: 'existing', tag }));
    if (key !== '' && !tooLong && !selectedKeys.has(key) && !findTagByName(tags, name)) list.push({ kind: 'create', name });
    return { options: list, more: Math.max(0, matching.length - MAX_SUGGESTIONS) };
  }, [tags, selectedKeys, key, name, tooLong]);

  const active = activeIndex >= 0 && activeIndex < options.length ? activeIndex : -1;
  const showList = open && !atLimit;

  const add = (choice: TagSelection) => {
    onChange([...value, choice]);
    setText('');
    setActiveIndex(-1);
    setNotice(null);
  };

  const choose = (option: Option) => add(option.kind === 'existing' ? { id: option.tag.id } : { name: option.name });

  /** Adds what was typed: an existing tag with that name, or a new one. Returns false if it could not. */
  const commitText = (): boolean => {
    if (name === '') return false;
    if (atLimit) {
      setNotice(t('Items can have at most {max} tags.', { max: MAX_TAGS_PER_ITEM }));
      return false;
    }
    if (tooLong) {
      setNotice(t('Tag names must be at most {max} characters.', { max: MAX_TAG_NAME_LENGTH }));
      return false;
    }
    if (selectedKeys.has(key)) {
      setText('');
      setNotice(t('“{name}” is already added.', { name }));
      return true;
    }
    const existing = findTagByName(tags, name);
    add(existing ? { id: existing.id } : { name });
    return true;
  };

  const remove = (index: number) => {
    onChange(value.filter((_, position) => position !== index));
    setNotice(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(active === -1 ? (step === 1 ? 0 : options.length - 1) : (active + step + options.length) % options.length);
    } else if (event.key === 'Enter' || (event.key === ',' && name !== '')) {
      const option = active === -1 ? undefined : options[active];
      // With nothing typed or highlighted, Enter keeps submitting the form as usual.
      if (!option && name === '') return;
      event.preventDefault();
      if (option && showList) choose(option);
      else commitText();
    } else if (event.key === 'Backspace' && text === '' && selected.length > 0) {
      const last = selected[selected.length - 1];
      if (last) remove(last.index);
    } else if (event.key === 'Escape' && showList) {
      // Close the suggestions first; a second Escape closes the dialog.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) return;
    setOpen(false);
    setActiveIndex(-1);
    // Don't lose a typed name when the user moves on (e.g. straight to "Save").
    commitText();
  };

  return (
    <div ref={wrapperRef} onBlur={onBlur}>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1.5 transition-colors hover:border-line-strong',
          'focus-within:border-accent-400 focus-within:ring-2 focus-within:ring-accent-500/25',
          inputProps['aria-invalid'] && 'border-danger/70',
        )}
      >
        {selected.length > 0 && (
          <ul aria-label={t('Selected tags')} className="contents">
            {selected.map((item) => (
              <li key={item.key} className="min-w-0">
                <TagChip
                  name={item.name}
                  color={item.tag?.color ?? null}
                  className="h-6 pr-0.5"
                  trailing={
                    <button
                      type="button"
                      aria-label={t('Remove tag {name}', { name: item.name })}
                      title={t('Remove {name}', { name: item.name })}
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(item.index);
                        inputRef.current?.focus();
                      }}
                      className="grid size-4 shrink-0 place-items-center rounded opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  }
                >
                  {item.tag ? undefined : (
                    <>
                      {item.name}
                      <span className="ml-1 text-[10px] font-normal opacity-70">{t('new')}</span>
                    </>
                  )}
                </TagChip>
              </li>
            ))}
          </ul>
        )}
        <input
          {...inputProps}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active !== -1 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="enter"
          maxLength={MAX_TAG_NAME_LENGTH * 2}
          placeholder={atLimit ? t('Tag limit reached') : selected.length === 0 ? t('Add tags…') : t('Add another…')}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setNotice(null);
            setActiveIndex(normalizeTagName(event.target.value) === '' ? -1 : 0);
          }}
          onKeyDown={onKeyDown}
          className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-subtle focus:outline-none focus-visible:outline-none"
        />
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={t('Tag suggestions')}
        className={cn('scrollbar-thin mt-1 max-h-48 overflow-y-auto rounded-lg border border-line-strong bg-raised p-1', (!showList || options.length === 0) && 'hidden')}
      >
        {options.map((option, index) => (
          <li
            key={option.kind === 'existing' ? option.tag.id : 'create'}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // Keep focus in the input so typing can continue.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            onMouseMove={() => {
              if (index !== active) setActiveIndex(index);
            }}
            className={cn('flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg', index === active && 'bg-overlay ring-1 ring-accent-500/40')}
          >
            {option.kind === 'existing' ? (
              <TagChip name={option.tag.name} color={option.tag.color} />
            ) : (
              <>
                <Plus className="size-3.5 shrink-0 text-accent-300" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {t('Create tag')} <span className="font-medium">“{option.name}”</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <p aria-live="polite" className="mt-1 text-xs text-subtle empty:hidden">
        {notice ??
          (showList && tooLong
            ? t('Tag names must be at most {max} characters.', { max: MAX_TAG_NAME_LENGTH })
            : showList && options.length === 0 && key === '' && tags.length === 0
              ? t('No tags yet. Type a name to create the first one.')
              : showList && more > 0
                ? tn('{count} more tag matches. Keep typing to narrow it down.|{count} more tags match. Keep typing to narrow it down.', more)
                : atLimit && open
                  ? t('Items can have at most {max} tags.', { max: MAX_TAGS_PER_ITEM })
                  : '')}
      </p>
    </div>
  );
}

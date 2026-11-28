import { useId, useState, type FormEvent } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/toastContext';
import { getCodeLanguage, type CodeLanguageId } from '../../domain/code/languages';
import { snippetInputSchema, type Snippet } from '../../domain/models';
import { cn } from '../../lib/cn';
import { useWorkspace, useWorkspaceActions } from '../../state/workspaceContext';
import { ProjectReferenceSelect } from '../create/ProjectReferenceSelect';
import { t, tn, translateText } from '../../i18n/translate';

interface SaveDialogProps {
  code: string;
  language: CodeLanguageId;
  /** The snippet the code is linked to, preselected as the target. */
  snippetId: string | null;
  onSaved: (snippetId: string) => void;
  onClose: () => void;
}

type Target = 'new' | 'existing';

/** The snippet language field is free text; the Code Tester writes its own label, or keeps the snippet's own spelling if it means the same. */
export function snippetLanguageLabel(language: CodeLanguageId): string {
  return getCodeLanguage(language).label;
}

/**
 * Saves Code Tester code with the existing snippet system: as a new snippet,
 * or into an existing one. A project is optional; no separate "code project"
 * data exists.
 */
export function SaveDialog({ code, language, snippetId, onSaved, onClose }: SaveDialogProps) {
  const workspace = useWorkspace();
  const { createSnippetWithId, updateSnippet } = useWorkspaceActions();
  const { showToast } = useToast();
  const snippets = [...workspace.snippets].sort((a, b) => a.title.localeCompare(b.title));
  const linked = snippets.find((snippet) => snippet.id === snippetId) ?? null;

  const [target, setTarget] = useState<Target>(linked ? 'existing' : 'new');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [existingId, setExistingId] = useState(linked?.id ?? snippets[0]?.id ?? '');
  const [projectId, setProjectId] = useState(linked?.projectId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const formId = useId();

  const existing: Snippet | null = snippets.find((snippet) => snippet.id === existingId) ?? null;

  const chooseExisting = (id: string) => {
    setExistingId(id);
    setProjectId(snippets.find((snippet) => snippet.id === id)?.projectId ?? '');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);
    const base = target === 'existing' && existing
      ? { title: existing.title, description: existing.description, tags: existing.tagIds.map((id) => ({ id })) }
      : { title, description, tags: [] };
    // An existing snippet keeps its language spelling when it already means this language.
    const languageText = target === 'existing' && existing && getCodeLanguage(language).label.toLowerCase() === existing.language.trim().toLowerCase() ? existing.language : snippetLanguageLabel(language);
    const parsed = snippetInputSchema.safeParse({ ...base, language: languageText, code, projectId });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'title') setFieldError(issue.message);
      else setError(issue?.message ?? t('The snippet could not be saved.'));
      return;
    }
    if (target === 'existing' && !existing) {
      setError(t('Pick the snippet to update.'));
      return;
    }
    setSaving(true);
    if (target === 'existing' && existing) {
      const result = await updateSnippet(existing.id, parsed.data);
      setSaving(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      showToast(t('Saved to “{title}”.', { title: existing.title }), 'success');
      onSaved(existing.id);
      return;
    }
    const result = await createSnippetWithId(parsed.data);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    showToast(t('Saved as a new snippet.'), 'success');
    onSaved(result.value);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Save code')}
      description={t('Code is saved as a snippet in your Snippet Vault, optionally linked to a project.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={saving}>
            {target === 'existing' ? t('Replace snippet code') : t('Save snippet')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-fg">{t('Save as')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['new', 'existing'] as const).map((entry) => {
              const disabled = entry === 'existing' && snippets.length === 0;
              return (
                <label
                  key={entry}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                    target === entry ? 'border-accent-500/60 bg-accent-500/10 text-fg' : 'border-line text-muted hover:border-line-strong',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input type="radio" name="target" value={entry} checked={target === entry} disabled={disabled} onChange={() => setTarget(entry)} className="accent-accent-500" />
                  {entry === 'new' ? t('New snippet') : t('Existing snippet')}
                </label>
              );
            })}
          </div>
        </fieldset>

        {target === 'new' ? (
          <>
            <Field label={t('Title')} error={fieldError}>
              {(field) => <Input {...field} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('Debounce helper')} autoComplete="off" data-autofocus />}
            </Field>
            <Field label={t('Description')} optional>
              {(field) => <Textarea {...field} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-16" />}
            </Field>
          </>
        ) : (
          <>
            <Field label={t('Snippet')} hint={t('Its code is replaced. Title, description and tags stay as they are.')}>
              {(field) => (
                <Select {...field} value={existingId} onChange={(event) => chooseExisting(event.target.value)}>
                  {snippets.map((snippet) => (
                    <option key={snippet.id} value={snippet.id}>
                      {snippet.title} ({snippet.language})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}

        <ProjectReferenceSelect value={projectId} onChange={setProjectId} />
        <p className="text-xs text-subtle">
          {t('Language')}: <span className="text-muted">{translateText(snippetLanguageLabel(language))}</span> · {tn('{count} line|{count} lines', code.split('\n').length)}
        </p>
        {error && <Alert tone="danger" title={t('Not saved')}>{error}</Alert>}
      </form>
    </Dialog>
  );
}

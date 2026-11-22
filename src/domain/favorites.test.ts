import { describe, expect, it } from 'vitest';

import { FIXED_NOW, makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace, sequentialIds, withoutFavorite } from '../test/fixtures';
import { applyImport } from './import';
import { projectSchema, workspaceSchema, type EntityType } from './models';
import { deleteNote, deleteProject, deleteSnippet, deleteTask, findEntity, setFavorite, setTaskStatus, updateNote, updateProject, updateSnippet, updateTask } from './workspace';

const context = () => ({ now: new Date('2026-02-01T08:00:00.000Z'), createId: sequentialIds('new') });

const workspace = makeWorkspace({
  projects: [makeProject()],
  tasks: [makeTask({ projectId: 'project-1' })],
  notes: [makeNote()],
  snippets: [makeSnippet()],
});

const ITEMS: Array<[EntityType, string]> = [
  ['project', 'project-1'],
  ['task', 'task-1'],
  ['note', 'note-1'],
  ['snippet', 'snippet-1'],
];

describe('setFavorite', () => {
  it.each(ITEMS)('marks and unmarks a %s without touching anything else', (type, id) => {
    const marked = setFavorite(workspace, type, id, true);
    expect(findEntity(marked, type, id)).toEqual({ ...findEntity(workspace, type, id), favorite: true });
    // A favourite is not an edit: "recently edited" stays the same.
    expect(findEntity(marked, type, id)?.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(findEntity(setFavorite(marked, type, id, false), type, id)).toEqual(findEntity(workspace, type, id));
  });

  it('only changes the one item and never mutates the input', () => {
    const many = makeWorkspace({ tasks: [makeTask(), makeTask({ id: 'task-2' })] });
    const snapshot = structuredClone(many);
    const next = setFavorite(many, 'task', 'task-2', true);
    expect(next.tasks.map((task) => task.favorite)).toEqual([false, true]);
    expect(many).toEqual(snapshot);
  });

  it('returns the same workspace for unknown ids or an unchanged value', () => {
    expect(setFavorite(workspace, 'note', 'missing', true)).toBe(workspace);
    expect(setFavorite(workspace, 'note', 'note-1', false)).toBe(workspace);
  });

  it('keeps the favourite when the item is edited or its status changes', () => {
    let ws = workspace;
    for (const [type, id] of ITEMS) ws = setFavorite(ws, type, id, true);
    ws = updateProject(ws, 'project-1', { name: 'Renamed', description: '', kind: 'game', status: 'paused', technologies: [], links: [], tags: [] }, context());
    ws = updateTask(ws, 'task-1', { title: 'Renamed', description: '', projectId: null, status: 'in_progress', priority: 'high', tags: [{ name: 'New tag' }] }, context());
    ws = updateNote(ws, 'note-1', { title: 'Renamed', content: 'x', projectId: 'project-1', tags: [] }, context());
    ws = updateSnippet(ws, 'snippet-1', { title: 'Renamed', language: 'Luau', code: 'print(1)', description: '', projectId: null, tags: [] }, context());
    ws = setTaskStatus(ws, 'task-1', 'done', context());
    for (const [type, id] of ITEMS) expect(findEntity(ws, type, id)?.favorite).toBe(true);
    expect(ws.projects[0]).toMatchObject({ name: 'Renamed', status: 'paused' });
    expect(ws.tasks[0]).toMatchObject({ title: 'Renamed', status: 'done' });
    expect(ws.snippets[0]).toMatchObject({ language: 'Luau' });
  });

  it('disappears together with the deleted item', () => {
    let ws = workspace;
    for (const [type, id] of ITEMS) ws = setFavorite(ws, type, id, true);
    ws = deleteTask(deleteNote(deleteSnippet(ws, 'snippet-1'), 'note-1'), 'task-1');
    ws = deleteProject(ws, 'project-1', { deleteContents: false }, context());
    expect(ws).toEqual(makeWorkspace());
  });

  it('keeps favourite contents of a deleted project when they are kept', () => {
    const ws = setFavorite(workspace, 'task', 'task-1', true);
    const next = deleteProject(ws, 'project-1', { deleteContents: false }, context());
    expect(next.tasks[0]).toMatchObject({ projectId: null, favorite: true });
  });
});

describe('favourites in the schema', () => {
  it('defaults to false for data without the field', () => {
    expect(projectSchema.parse(withoutFavorite(makeProject())).favorite).toBe(false);
  });

  it('treats anything other than a boolean as "not a favourite" instead of failing', () => {
    const parsed = workspaceSchema.parse({
      ...makeWorkspace(),
      projects: [{ ...makeProject(), favorite: 'yes' }],
      tasks: [{ ...makeTask(), favorite: null }],
      notes: [{ ...makeNote(), favorite: 1 }],
      snippets: [{ ...makeSnippet(), favorite: true }],
    });
    expect([parsed.projects[0]?.favorite, parsed.tasks[0]?.favorite, parsed.notes[0]?.favorite, parsed.snippets[0]?.favorite]).toEqual([false, false, false, true]);
  });
});

describe('favourites when importing', () => {
  const current = makeWorkspace({ projects: [makeProject({ favorite: true })], notes: [makeNote()] });

  it('replace takes the favourites from the file', () => {
    const file = makeWorkspace({ notes: [makeNote({ favorite: true })] });
    const { workspace: result } = applyImport(current, file, { kind: 'replace' }, context());
    expect(result.projects).toEqual([]);
    expect(result.notes[0]?.favorite).toBe(true);
  });

  it('merge adds new favourites from the file and keeps the current ones', () => {
    const file = makeWorkspace({ snippets: [makeSnippet({ favorite: true })], tags: [makeTag()] });
    const { workspace: result, stats } = applyImport(current, file, { kind: 'merge', conflicts: 'keep-current' }, context());
    expect(result.projects[0]?.favorite).toBe(true);
    expect(result.snippets[0]?.favorite).toBe(true);
    expect(stats.added).toBe(1);
  });

  it('a file without the favourite never silently removes it with "keep current"', () => {
    const file = makeWorkspace({ projects: [makeProject({ favorite: false })] });
    const { workspace: result, stats } = applyImport(current, file, { kind: 'merge', conflicts: 'keep-current' }, context());
    expect(result.projects[0]?.favorite).toBe(true);
    expect(stats.skipped).toBe(1);
  });

  it('a different favourite counts as a conflict and follows the chosen policy', () => {
    const file = makeWorkspace({ notes: [makeNote({ favorite: true })] });
    expect(applyImport(current, file, { kind: 'merge', conflicts: 'use-imported' }, context()).workspace.notes[0]?.favorite).toBe(true);
    const both = applyImport(current, file, { kind: 'merge', conflicts: 'keep-both' }, context()).workspace.notes;
    expect(both.map((note) => [note.id, note.favorite])).toEqual([
      ['new-1', true],
      ['note-1', false],
    ]);
  });
});

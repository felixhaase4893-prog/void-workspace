import { describe, expect, it } from 'vitest';

import { FIXED_NOW, makeNote, makeProject, makeSnippet, makeTask, makeWorkspace, sequentialIds } from '../test/fixtures';
import { formatLinkLines, noteInputSchema, projectInputSchema, snippetInputSchema, taskInputSchema } from './models';
import {
  addProject,
  addSnippet,
  addTask,
  countOpenTasks,
  deleteNote,
  deleteProject,
  deleteSnippet,
  deleteTask,
  findEntity,
  getProjectContents,
  getProjectSummaries,
  getRecentItems,
  isWorkspaceEmpty,
  setTaskStatus,
  updateNote,
  updateProject,
  updateSnippet,
  updateTask,
} from './workspace';

const context = () => ({ now: FIXED_NOW, createId: sequentialIds() });
const later = { now: new Date('2026-02-01T00:00:00.000Z') };

const projectInput = (fields: Record<string, string> = {}) =>
  projectInputSchema.parse({ name: 'VOID', description: '', kind: 'web', ...fields });
const taskInput = (fields: Record<string, string> = {}) =>
  taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low', ...fields });

describe('workspace operations', () => {
  it('adds a project with generated id, timestamps and active status', () => {
    const next = addProject(makeWorkspace(), projectInput(), context());
    expect(next.projects).toEqual([
      expect.objectContaining({ id: 'id-1', name: 'VOID', status: 'active', technologies: [], links: [], createdAt: FIXED_NOW.toISOString() }),
    ]);
  });

  it('does not mutate the original workspace', () => {
    const original = makeWorkspace();
    addProject(original, projectInput(), context());
    expect(original.projects).toHaveLength(0);
  });

  it('drops references to projects that do not exist', () => {
    const next = addTask(makeWorkspace(), taskInput({ projectId: 'missing' }), context());
    expect(next.tasks[0]?.projectId).toBeNull();
  });

  it('updates task status and timestamp', () => {
    const next = setTaskStatus(makeWorkspace({ tasks: [makeTask()] }), 'task-1', 'done', later);
    expect(next.tasks[0]).toMatchObject({ status: 'done', updatedAt: later.now.toISOString() });
  });

  it('adds snippets to existing projects only', () => {
    const workspace = makeWorkspace({ projects: [makeProject()] });
    const input = snippetInputSchema.parse({ title: 'A', language: 'Lua', code: 'x', description: '', projectId: 'project-1' });
    expect(addSnippet(workspace, input, context()).snippets[0]?.projectId).toBe('project-1');
    expect(addSnippet(workspace, { ...input, projectId: 'gone' }, context()).snippets[0]?.projectId).toBeNull();
  });
});

describe('editing', () => {
  it('updates a project, keeps id and createdAt and bumps updatedAt', () => {
    const workspace = makeWorkspace({ projects: [makeProject(), makeProject({ id: 'other', name: 'Other' })] });
    const input = projectInput({ name: 'Obby Rush 2', status: 'paused', technologies: 'Luau, Rojo', links: 'Repo | https://github.com/a/b' });
    const next = updateProject(workspace, 'project-1', input, later);
    expect(next.projects[0]).toEqual({
      ...makeProject(),
      name: 'Obby Rush 2',
      kind: 'web',
      status: 'paused',
      technologies: ['Luau', 'Rojo'],
      links: [{ label: 'Repo', url: 'https://github.com/a/b' }],
      updatedAt: later.now.toISOString(),
    });
    expect(next.projects[1]).toBe(workspace.projects[1]);
  });

  it('updates tasks including status and drops unknown project references', () => {
    const workspace = makeWorkspace({ projects: [makeProject()], tasks: [makeTask()] });
    const next = updateTask(workspace, 'task-1', taskInput({ title: 'B', status: 'in_progress', projectId: 'project-1' }), later);
    expect(next.tasks[0]).toMatchObject({ title: 'B', status: 'in_progress', projectId: 'project-1', createdAt: FIXED_NOW.toISOString() });
    expect(updateTask(workspace, 'task-1', taskInput({ projectId: 'gone' }), later).tasks[0]?.projectId).toBeNull();
  });

  it('updates notes and snippets', () => {
    const workspace = makeWorkspace({ notes: [makeNote()], snippets: [makeSnippet()] });
    const note = updateNote(workspace, 'note-1', noteInputSchema.parse({ title: 'New', content: 'Text', projectId: '' }), later);
    expect(note.notes[0]).toMatchObject({ title: 'New', content: 'Text', updatedAt: later.now.toISOString() });
    const input = snippetInputSchema.parse({ title: 'S', language: 'Go', code: 'x', description: '' });
    expect(updateSnippet(workspace, 'snippet-1', input, later).snippets[0]).toMatchObject({ title: 'S', language: 'Go', code: 'x' });
  });

  it('leaves the workspace unchanged for unknown ids', () => {
    const workspace = makeWorkspace({ tasks: [makeTask()] });
    expect(updateTask(workspace, 'nope', taskInput(), later).tasks).toEqual(workspace.tasks);
  });
});

describe('deleting', () => {
  const workspace = makeWorkspace({
    projects: [makeProject(), makeProject({ id: 'other' })],
    tasks: [makeTask({ projectId: 'project-1' }), makeTask({ id: 'task-2', projectId: 'other' })],
    notes: [makeNote({ projectId: 'project-1' })],
    snippets: [makeSnippet({ projectId: 'project-1' })],
  });

  it('deletes a project and keeps its contents without a project', () => {
    const next = deleteProject(workspace, 'project-1', { deleteContents: false }, later);
    expect(next.projects.map((p) => p.id)).toEqual(['other']);
    expect(next.tasks.map((t) => t.projectId)).toEqual([null, 'other']);
    expect(next.notes[0]?.projectId).toBeNull();
    expect(next.snippets[0]?.projectId).toBeNull();
    expect(next.tasks[0]?.updatedAt).toBe(later.now.toISOString());
  });

  it('deletes a project together with its contents', () => {
    const next = deleteProject(workspace, 'project-1', { deleteContents: true }, later);
    expect(next.tasks.map((t) => t.id)).toEqual(['task-2']);
    expect(next.notes).toEqual([]);
    expect(next.snippets).toEqual([]);
  });

  it('deletes single tasks, notes and snippets', () => {
    expect(deleteTask(workspace, 'task-1').tasks.map((t) => t.id)).toEqual(['task-2']);
    expect(deleteNote(workspace, 'note-1').notes).toEqual([]);
    expect(deleteSnippet(workspace, 'snippet-1').snippets).toEqual([]);
  });

  it('finds items and project contents', () => {
    expect(findEntity(workspace, 'note', 'note-1')?.title).toBe('Save system');
    expect(findEntity(workspace, 'task', 'missing')).toBeNull();
    const contents = getProjectContents(workspace, 'project-1');
    expect([contents.tasks.length, contents.notes.length, contents.snippets.length]).toEqual([1, 1, 1]);
  });
});

describe('workspace selectors', () => {
  const workspace = makeWorkspace({
    projects: [makeProject()],
    tasks: [
      makeTask({ id: 't1', projectId: 'project-1' }),
      makeTask({ id: 't2', projectId: 'project-1', status: 'done', updatedAt: '2026-03-01T00:00:00.000Z' }),
      makeTask({ id: 't3', status: 'in_progress' }),
    ],
  });

  it('counts tasks that are not done as open', () => {
    expect(countOpenTasks(workspace)).toBe(2);
  });

  it('summarises open and total tasks per project', () => {
    expect(getProjectSummaries(workspace)).toEqual([expect.objectContaining({ openTasks: 1, totalTasks: 2 })]);
  });

  it('lists recently edited items newest first', () => {
    const recent = getRecentItems(workspace, 2);
    expect(recent.map((item) => item.id)).toEqual(['t2', 'project-1']);
  });

  it('detects an empty workspace', () => {
    expect(isWorkspaceEmpty(makeWorkspace())).toBe(true);
    expect(isWorkspaceEmpty(workspace)).toBe(false);
  });
});

describe('input validation', () => {
  it('trims and requires a project name', () => {
    const result = projectInputSchema.safeParse({ name: '   ', description: '', kind: 'web' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Name is required.');
  });

  it('rejects unknown project kinds', () => {
    expect(projectInputSchema.safeParse({ name: 'X', description: '', kind: 'blockchain' }).success).toBe(false);
  });

  it('turns an empty project reference into null', () => {
    const result = taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'high' });
    expect(result.projectId).toBeNull();
  });

  it('parses technologies from a comma-separated list without duplicates', () => {
    expect(projectInput({ technologies: ' React, TypeScript,, react ,Vite ' }).technologies).toEqual(['React', 'TypeScript', 'Vite']);
  });

  it('parses links line by line and rejects invalid URLs', () => {
    const links = projectInput({ links: 'https://void.dev\nDocs | https://docs.void.dev/a?b=1\n' }).links;
    expect(links).toEqual([
      { label: '', url: 'https://void.dev' },
      { label: 'Docs', url: 'https://docs.void.dev/a?b=1' },
    ]);
    expect(formatLinkLines(links)).toBe('https://void.dev\nDocs | https://docs.void.dev/a?b=1');

    const invalid = projectInputSchema.safeParse({ name: 'X', description: '', kind: 'web', links: 'not a url' });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.path[0]).toBe('links');
    expect(projectInputSchema.safeParse({ name: 'X', description: '', kind: 'web', links: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('keeps snippet code whitespace untouched', () => {
    const code = '  indented()\n';
    expect(snippetInputSchema.parse({ title: 'A', language: 'Lua', code, description: '' }).code).toBe(code);
  });
});

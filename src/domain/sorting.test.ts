import { describe, expect, it } from 'vitest';

import { makeNote, makeProject, makeSnippet, makeTask, makeWorkspace } from '../test/fixtures';
import { EMPTY_FILTERS, filterItems, toggleFilterValue } from './filters';
import type { Task } from './models';
import { DEFAULT_SORT, SORT_KEYS, SORT_LABELS, isSortKeyFor, sortItems, sortName, type SortKey } from './sorting';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T10:00:00.000Z`;

const tasks: Task[] = [
  makeTask({ id: 'b', title: 'beta', priority: 'low', status: 'done', createdAt: at(2), updatedAt: at(9) }),
  makeTask({ id: 'a', title: 'Alpha', priority: 'high', status: 'in_progress', createdAt: at(5), updatedAt: at(5) }),
  makeTask({ id: 'c', title: 'Gamma', priority: 'medium', status: 'todo', createdAt: at(1), updatedAt: at(1) }),
  makeTask({ id: 'd', title: 'delta', priority: 'high', status: 'todo', createdAt: at(3), updatedAt: at(3) }),
];

const ids = (items: ReadonlyArray<{ id: string }>) => items.map((item) => item.id);

describe('sort options', () => {
  it('offers name and date sorting everywhere, priority and status only for tasks', () => {
    for (const type of ['project', 'note', 'snippet'] as const) {
      expect(SORT_KEYS[type]).toEqual(['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'updated-desc']);
      expect(isSortKeyFor(type, 'priority')).toBe(false);
      expect(isSortKeyFor(type, 'status')).toBe(false);
    }
    expect(SORT_KEYS.task).toContain('priority');
    expect(SORT_KEYS.task).toContain('status');
    expect(SORT_KEYS.task[0]).toBe(DEFAULT_SORT);
  });

  it('has a label for every key and rejects unknown values', () => {
    for (const key of Object.keys(SORT_LABELS)) expect(SORT_LABELS[key as SortKey]).not.toBe('');
    expect(isSortKeyFor('task', 'nonsense')).toBe(false);
    expect(isSortKeyFor('task', 'name-asc')).toBe(true);
  });
});

describe('sortItems', () => {
  it('keeps the stored order by default and returns a copy', () => {
    const result = sortItems(tasks, 'task', 'default');
    expect(ids(result)).toEqual(['b', 'a', 'c', 'd']);
    expect(result).not.toBe(tasks);
  });

  it('sorts by name case-insensitively in both directions', () => {
    expect(ids(sortItems(tasks, 'task', 'name-asc'))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(sortItems(tasks, 'task', 'name-desc'))).toEqual(['c', 'd', 'b', 'a']);
  });

  it('sorts names with numbers naturally', () => {
    const notes = [makeNote({ id: 'n10', title: 'Step 10' }), makeNote({ id: 'n2', title: 'Step 2' }), makeNote({ id: 'n1', title: 'Step 1' })];
    expect(ids(sortItems(notes, 'note', 'name-asc'))).toEqual(['n1', 'n2', 'n10']);
  });

  it('uses the project name for projects', () => {
    const projects = [makeProject({ id: 'z', name: 'Zeta' }), makeProject({ id: 'v', name: 'VOID' }), makeProject({ id: 'o', name: 'Obby Rush' })];
    expect(sortName(projects[0]!)).toBe('Zeta');
    expect(ids(sortItems(projects, 'project', 'name-asc'))).toEqual(['o', 'v', 'z']);
  });

  it('sorts by creation date and by last update', () => {
    expect(ids(sortItems(tasks, 'task', 'created-desc'))).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(sortItems(tasks, 'task', 'created-asc'))).toEqual(['c', 'b', 'd', 'a']);
    expect(ids(sortItems(tasks, 'task', 'updated-desc'))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('sorts tasks by priority (high first) and status (to do first), keeping stored order for ties', () => {
    expect(ids(sortItems(tasks, 'task', 'priority'))).toEqual(['a', 'd', 'c', 'b']);
    expect(ids(sortItems(tasks, 'task', 'status'))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('is stable: equal items keep their stored order, in every direction', () => {
    const same = [makeSnippet({ id: '1', title: 'Same' }), makeSnippet({ id: '2', title: 'same' }), makeSnippet({ id: '3', title: 'SAME' })];
    for (const key of SORT_KEYS.snippet) expect(ids(sortItems(same, 'snippet', key))).toEqual(['1', '2', '3']);
  });

  it('never changes the items or their array', () => {
    const before = JSON.stringify(tasks);
    for (const key of SORT_KEYS.task) sortItems(tasks, 'task', key);
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('falls back to the stored order for a key that does not fit the list', () => {
    const notes = [makeNote({ id: 'x', title: 'B' }), makeNote({ id: 'y', title: 'A' })];
    expect(ids(sortItems(notes, 'note', 'priority'))).toEqual(['x', 'y']);
  });

  it('puts unparseable dates last when sorting newest first', () => {
    const broken = [makeNote({ id: 'bad', createdAt: 'garbage' }), makeNote({ id: 'ok', createdAt: at(1) })];
    expect(ids(sortItems(broken, 'note', 'created-desc'))).toEqual(['ok', 'bad']);
  });
});

describe('sorting together with filters', () => {
  it('sorts only the filtered items, and filtering does not change the chosen order', () => {
    const workspace = makeWorkspace({ tasks });
    const filters = toggleFilterValue(EMPTY_FILTERS, 'status', 'todo');
    const visible = sortItems(filterItems(workspace, 'task', filters), 'task', 'name-asc');
    expect(ids(visible)).toEqual(['d', 'c']);

    const favorites = makeWorkspace({ tasks: tasks.map((task) => ({ ...task, favorite: task.id !== 'a' })) });
    const query = { ...EMPTY_FILTERS, favoritesOnly: true };
    expect(ids(sortItems(filterItems(favorites, 'task', query), 'task', 'priority'))).toEqual(['d', 'c', 'b']);
  });
});

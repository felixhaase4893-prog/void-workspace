import { describe, expect, it, vi } from 'vitest';

import { WORKSPACE_SCHEMA_VERSION } from '../domain/models';
import { makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace, withoutFavorite } from '../test/fixtures';
import { KeyValueWorkspaceRepository, WORKSPACE_STORAGE_KEY, createDefaultRepository } from './keyValueWorkspaceRepository';
import { MemoryKeyValueStore, type KeyValueStore } from './keyValueStore';
import { WORKSPACE_MIGRATIONS, migrate } from './migrations';

function setup(initial: Record<string, string> = {}) {
  const store = new MemoryKeyValueStore(initial);
  const repository = new KeyValueWorkspaceRepository({
    store,
    events: null,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  return { store, repository };
}

function failingStore(error: unknown, failOn: 'read' | 'write'): KeyValueStore {
  return {
    getItem: () => {
      if (failOn === 'read') throw error;
      return null;
    },
    setItem: () => {
      if (failOn === 'write') throw error;
    },
    removeItem: () => {},
  };
}

describe('KeyValueWorkspaceRepository', () => {
  it('returns an empty workspace when nothing is stored', async () => {
    const { repository } = setup();
    const result = await repository.load();
    expect(result).toEqual({ ok: true, value: { workspace: makeWorkspace(), source: 'new', migratedFrom: null } });
  });

  it('saves and loads the same data again', async () => {
    const { store, repository } = setup();
    const workspace = makeWorkspace({ projects: [makeProject()] });
    expect((await repository.save(workspace)).ok).toBe(true);

    const reopened = new KeyValueWorkspaceRepository({ store, events: null });
    const result = await reopened.load();
    expect(result.ok && result.value.workspace).toEqual(workspace);
    expect(result.ok && result.value.source).toBe('stored');
  });

  it('reports corrupt JSON without touching the stored data', async () => {
    const { store, repository } = setup({ [WORKSPACE_STORAGE_KEY]: '{not json' });
    const result = await repository.load();
    expect(result).toMatchObject({ ok: false, error: { kind: 'corrupt' } });
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBe('{not json');
  });

  it('reports data that fails schema validation with readable issues', async () => {
    const broken = { ...makeWorkspace(), projects: [{ ...makeProject(), kind: 'blockchain' }] };
    const { repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(broken) });
    const result = await repository.load();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid') {
      expect(result.error.issues[0]).toContain('projects.0.kind');
    } else {
      throw new Error('expected an invalid error');
    }
  });

  it('rejects data from a newer version of VOID', async () => {
    const future = { ...makeWorkspace(), schemaVersion: WORKSPACE_SCHEMA_VERSION + 1 };
    const { repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(future) });
    expect(await repository.load()).toMatchObject({
      ok: false,
      error: { kind: 'unsupported-version', version: WORKSPACE_SCHEMA_VERSION + 1 },
    });
  });

  it('reports data without a schema version as invalid', async () => {
    const { repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify({ projects: [] }) });
    expect(await repository.load()).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('migrates old data and writes the upgraded format back', async () => {
    const store = new MemoryKeyValueStore({
      [WORKSPACE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 0, items: [] }),
    });
    const repository = new KeyValueWorkspaceRepository({
      store,
      events: null,
      // A made-up v0 → v1 step followed by the real migrations.
      migrations: { ...WORKSPACE_MIGRATIONS, 0: () => ({ schemaVersion: 1, projects: [], tasks: [], notes: [], snippets: [] }) },
    });
    const result = await repository.load();
    expect(result).toMatchObject({ ok: true, value: { migratedFrom: 0, source: 'stored' } });
    expect(JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '')).toEqual(makeWorkspace());
  });

  it('upgrades real v1 data (VOID 0.1) to the current format and keeps every item', async () => {
    const v1 = {
      schemaVersion: 1,
      projects: [{ ...makeProject(), technologies: undefined, links: undefined }],
      tasks: [makeTask({ projectId: 'project-1' })],
      notes: [],
      snippets: [{ ...makeSnippet(), projectId: undefined }],
    };
    const { store, repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(v1) });
    const result = await repository.load();
    expect(result).toMatchObject({ ok: true, value: { migratedFrom: 1 } });
    const expected = makeWorkspace({ projects: [makeProject()], tasks: [makeTask({ projectId: 'project-1' })], snippets: [makeSnippet()] });
    expect(result.ok && result.value.workspace).toEqual(expected);
    expect(JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '')).toEqual(expected);
  });

  it('upgrades v2 data to the current format: every item is kept and starts without tags', async () => {
    const v2 = {
      schemaVersion: 2,
      projects: [{ ...makeProject({ technologies: ['Luau'] }), tagIds: undefined }],
      tasks: [{ ...makeTask({ projectId: 'project-1' }), tagIds: undefined }],
      notes: [{ ...makeNote(), tagIds: undefined }],
      snippets: [{ ...makeSnippet({ projectId: 'project-1' }), tagIds: undefined }],
    };
    const { store, repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(v2) });
    const result = await repository.load();
    const expected = makeWorkspace({
      projects: [makeProject({ technologies: ['Luau'] })],
      tasks: [makeTask({ projectId: 'project-1' })],
      notes: [makeNote()],
      snippets: [makeSnippet({ projectId: 'project-1' })],
    });
    expect(result).toMatchObject({ ok: true, value: { migratedFrom: 2 } });
    expect(result.ok && result.value.workspace).toEqual(expected);
    expect(JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '')).toMatchObject({ schemaVersion: WORKSPACE_SCHEMA_VERSION, tags: [] });
  });

  it('upgrades v3 data to v4 (and on to the current format): everything is kept and nothing is a favourite yet', async () => {
    const v3 = {
      schemaVersion: 3,
      tags: [makeTag()],
      projects: [withoutFavorite(makeProject({ tagIds: ['tag-1'] }))],
      tasks: [withoutFavorite(makeTask({ projectId: 'project-1', status: 'in_progress' }))],
      notes: [withoutFavorite(makeNote())],
      snippets: [withoutFavorite(makeSnippet({ projectId: 'project-1' }))],
    };
    const { store, repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(v3) });
    const result = await repository.load();
    const expected = makeWorkspace({
      tags: [makeTag()],
      projects: [makeProject({ tagIds: ['tag-1'] })],
      tasks: [makeTask({ projectId: 'project-1', status: 'in_progress' })],
      notes: [makeNote()],
      snippets: [makeSnippet({ projectId: 'project-1' })],
    });
    expect(result).toMatchObject({ ok: true, value: { migratedFrom: 3 } });
    expect(result.ok && result.value.workspace).toEqual(expected);
    expect(JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '')).toEqual({ ...expected, schemaVersion: WORKSPACE_SCHEMA_VERSION });
  });

  it('saves and reloads favourites', async () => {
    const workspace = makeWorkspace({ projects: [makeProject({ favorite: true })], snippets: [makeSnippet({ favorite: true })], notes: [makeNote()] });
    const { repository } = setup();
    expect(await repository.save(workspace)).toEqual({ ok: true, value: undefined });
    const loaded = await repository.load();
    expect(loaded).toMatchObject({ ok: true, value: { workspace } });
  });

  it('saves and reloads tags and their assignments', async () => {
    const workspace = makeWorkspace({ tags: [makeTag({ color: 'teal' })], notes: [makeNote({ tagIds: ['tag-1'] })] });
    const { repository } = setup();
    expect(await repository.save(workspace)).toEqual({ ok: true, value: undefined });
    expect(await repository.load()).toMatchObject({ ok: true, value: { workspace } });
  });

  it('keeps damaged tag data untouched and reports it instead of silently repairing it', async () => {
    const raw = JSON.stringify({ ...makeWorkspace(), tags: [{ id: 'x', name: '' }] });
    const { store, repository } = setup({ [WORKSPACE_STORAGE_KEY]: raw });
    expect(await repository.load()).toMatchObject({ ok: false, error: { kind: 'invalid' } });
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBe(raw);
  });

  it('loads stale tag references without failing', async () => {
    const workspace = makeWorkspace({ tasks: [makeTask({ tagIds: ['deleted-tag'] })] });
    const { repository } = setup({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
    expect(await repository.load()).toMatchObject({ ok: true });
  });

  it('maps a full storage quota to a quota-exceeded error', async () => {
    const repository = new KeyValueWorkspaceRepository({
      store: failingStore(new DOMException('full', 'QuotaExceededError'), 'write'),
      events: null,
    });
    expect(await repository.save(makeWorkspace())).toMatchObject({ ok: false, error: { kind: 'quota-exceeded' } });
  });

  it('maps other write failures to write-failed', async () => {
    const repository = new KeyValueWorkspaceRepository({ store: failingStore(new Error('boom'), 'write'), events: null });
    expect(await repository.save(makeWorkspace())).toMatchObject({ ok: false, error: { kind: 'write-failed' } });
  });

  it('reports storage that throws on read as unavailable', async () => {
    const repository = new KeyValueWorkspaceRepository({
      store: failingStore(new DOMException('denied', 'SecurityError'), 'read'),
      events: null,
    });
    expect(await repository.load()).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });

  it('refuses to save invalid data', async () => {
    const { store, repository } = setup();
    const invalid = makeWorkspace({ projects: [makeProject({ name: '' })] });
    expect(await repository.save(invalid)).toMatchObject({ ok: false, error: { kind: 'invalid' } });
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('quarantines unreadable data under a backup key', async () => {
    const { store, repository } = setup({ [WORKSPACE_STORAGE_KEY]: 'garbage' });
    const result = await repository.quarantine();
    expect(result).toEqual({ ok: true, value: `${WORKSPACE_STORAGE_KEY}:backup:2026-01-01T00:00:00.000Z` });
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(store.getItem(`${WORKSPACE_STORAGE_KEY}:backup:2026-01-01T00:00:00.000Z`)).toBe('garbage');
  });

  it('notifies subscribers about changes from other tabs for its key only', () => {
    const events = new EventTarget();
    const repository = new KeyValueWorkspaceRepository({
      store: new MemoryKeyValueStore(),
      events: events as unknown as Window,
    });
    const listener = vi.fn();
    const unsubscribe = repository.subscribe(listener);
    events.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    events.dispatchEvent(new StorageEvent('storage', { key: WORKSPACE_STORAGE_KEY }));
    unsubscribe();
    events.dispatchEvent(new StorageEvent('storage', { key: WORKSPACE_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createDefaultRepository', () => {
  it('falls back to non-persistent memory storage when the browser store is unavailable', () => {
    const { repository, warning } = createDefaultRepository(
      () => ({ ok: false, error: { kind: 'unavailable', message: 'blocked' } }),
      () => new MemoryKeyValueStore(),
    );
    expect(repository.persistent).toBe(false);
    expect(warning?.kind).toBe('unavailable');
  });
});

describe('migrate', () => {
  it('runs migrations in order', () => {
    const result = migrate({ schemaVersion: 0, log: [] }, 2, {
      0: (data) => ({ ...data, schemaVersion: 1, log: ['0→1'] }),
      1: (data) => ({ ...data, schemaVersion: 2, log: [...(data.log as string[]), '1→2'] }),
    });
    expect(result).toEqual({ ok: true, value: { fromVersion: 0, data: { schemaVersion: 2, log: ['0→1', '1→2'] } } });
  });

  it('fails when a migration step is missing', () => {
    expect(migrate({ schemaVersion: 0 }, 2, { 0: (d) => ({ ...d, schemaVersion: 1 }) })).toMatchObject({
      ok: false,
      error: { kind: 'unsupported-version' },
    });
  });

  it('rejects non-object data', () => {
    expect(migrate([1, 2], 1, {})).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });
});

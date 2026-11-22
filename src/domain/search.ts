import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS, PROJECT_KIND_LABELS, PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from './labels';
import type { EntityType, Workspace } from './models';

/**
 * Local full-text search over the workspace. Pure functions only: the index is
 * built once per workspace version, and each query just scans lowercased text.
 */

export const SEARCH_TYPES: readonly EntityType[] = ['project', 'task', 'bug', 'note', 'snippet'];

/** Longer queries are cut off; nobody types more, and pasted text should stay cheap. */
export const MAX_QUERY_LENGTH = 200;
const MAX_TERMS = 8;
/** Long notes and snippets are only indexed up to here, so typing stays fast. */
export const MAX_INDEXED_FIELD_LENGTH = 20_000;
const CONTEXT_BEFORE = 30;
const CONTEXT_LENGTH = 110;

interface IndexedField {
  label: string;
  /** Display text, whitespace collapsed for single-line context. */
  text: string;
  /** `text` lowercased once, at index time. */
  lower: string;
  weight: number;
}

export interface SearchIndexEntry {
  type: EntityType;
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  /** Tag ids as stored; the dialog shows the current names and colours. */
  tagIds: string[];
  updatedAt: string;
  fields: IndexedField[];
}

export type SearchIndex = SearchIndexEntry[];

export interface SearchResult {
  type: EntityType;
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  tagIds: string[];
  /** Short excerpt around the first match outside the title, if any. */
  context: string | null;
  /** Which field the context comes from, e.g. "Code". */
  contextLabel: string | null;
  score: number;
}

export interface SearchGroup {
  type: EntityType;
  results: SearchResult[];
  /** Matches in this group, including any cut off by the limit. */
  total: number;
}

export interface SearchResults {
  terms: string[];
  groups: SearchGroup[];
  total: number;
}

/* ---------- Query ---------- */

/** "  React  HOOK react " → ["react", "hook"]: trimmed, lowercased, without duplicates. */
export function parseQuery(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const terms = raw.slice(0, MAX_QUERY_LENGTH).toLowerCase().split(/\s+/).filter(Boolean);
  return Array.from(new Set(terms)).slice(0, MAX_TERMS);
}

/* ---------- Index ---------- */

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

function field(label: string, value: string, weight: number): IndexedField | null {
  const display = value.slice(0, MAX_INDEXED_FIELD_LENGTH).replace(/\s+/g, ' ').trim();
  return display === '' ? null : { label, text: display, lower: display.toLowerCase(), weight };
}

function entry(base: Omit<SearchIndexEntry, 'fields'>, fields: Array<IndexedField | null>): SearchIndexEntry {
  return { ...base, fields: fields.filter((item): item is IndexedField => item !== null) };
}

/**
 * Turns the workspace into searchable entries. Tolerates missing or malformed
 * fields (e.g. from an older backup) instead of throwing.
 */
export function buildSearchIndex(workspace: Partial<Workspace> | null | undefined): SearchIndex {
  const projects = Array.isArray(workspace?.projects) ? workspace.projects : [];
  const tasks = Array.isArray(workspace?.tasks) ? workspace.tasks : [];
  const notes = Array.isArray(workspace?.notes) ? workspace.notes : [];
  const snippets = Array.isArray(workspace?.snippets) ? workspace.snippets : [];
  const bugs = Array.isArray(workspace?.bugs) ? workspace.bugs : [];

  const projectNames = new Map<string, string>();
  for (const project of projects) {
    if (project && typeof project.id === 'string') projectNames.set(project.id, text(project.name));
  }
  // Tag names are resolved here, so renamed or deleted tags never linger in the index.
  const tagNames = new Map<string, string>();
  for (const tag of Array.isArray(workspace?.tags) ? workspace.tags : []) {
    if (tag && typeof tag.id === 'string') tagNames.set(tag.id, text(tag.name));
  }
  const tagsOf = (tagIds: unknown) => {
    const ids = textList(tagIds).filter((id) => tagNames.has(id));
    return { tagIds: ids, field: field('Tags', ids.map((id) => tagNames.get(id) ?? '').join(', '), 5) };
  };

  const projectOf = (projectId: unknown) => {
    const id = typeof projectId === 'string' ? projectId : null;
    return { projectId: id, projectName: id === null ? null : (projectNames.get(id) ?? null) };
  };

  const index: SearchIndex = [];

  for (const project of projects) {
    if (!project || typeof project.id !== 'string') continue;
    const links = Array.isArray(project.links) ? project.links : [];
    const tags = tagsOf(project.tagIds);
    index.push(
      entry(
        { type: 'project', id: project.id, title: text(project.name) || 'Untitled project', projectId: null, projectName: null, tagIds: tags.tagIds, updatedAt: text(project.updatedAt) },
        [
          field('Name', text(project.name), 10),
          tags.field,
          field('Description', text(project.description), 3),
          field('Technologies', textList(project.technologies).join(', '), 5),
          field('Type', PROJECT_KIND_LABELS[project.kind] ?? '', 2),
          field('Status', PROJECT_STATUS_LABELS[project.status] ?? '', 2),
          field('Links', links.map((link) => [text(link?.label), text(link?.url)].filter(Boolean).join(' ')).join(', '), 1),
        ],
      ),
    );
  }

  for (const task of tasks) {
    if (!task || typeof task.id !== 'string') continue;
    const project = projectOf(task.projectId);
    const tags = tagsOf(task.tagIds);
    index.push(
      entry(
        { type: 'task', id: task.id, title: text(task.title) || 'Untitled task', updatedAt: text(task.updatedAt), tagIds: tags.tagIds, ...project },
        [
          field('Title', text(task.title), 10),
          tags.field,
          field('Description', text(task.description), 3),
          field('Status', TASK_STATUS_LABELS[task.status] ?? '', 2),
          field('Priority', TASK_PRIORITY_LABELS[task.priority] ?? '', 2),
          field('Project', project.projectName ?? '', 2),
        ],
      ),
    );
  }

  for (const note of notes) {
    if (!note || typeof note.id !== 'string') continue;
    const project = projectOf(note.projectId);
    const tags = tagsOf(note.tagIds);
    index.push(
      entry(
        { type: 'note', id: note.id, title: text(note.title) || 'Untitled note', updatedAt: text(note.updatedAt), tagIds: tags.tagIds, ...project },
        [field('Title', text(note.title), 10), tags.field, field('Content', text(note.content), 3), field('Project', project.projectName ?? '', 2)],
      ),
    );
  }

  for (const snippet of snippets) {
    if (!snippet || typeof snippet.id !== 'string') continue;
    const project = projectOf(snippet.projectId);
    const tags = tagsOf(snippet.tagIds);
    index.push(
      entry(
        { type: 'snippet', id: snippet.id, title: text(snippet.title) || 'Untitled snippet', updatedAt: text(snippet.updatedAt), tagIds: tags.tagIds, ...project },
        [
          field('Title', text(snippet.title), 10),
          tags.field,
          field('Description', text(snippet.description), 3),
          field('Language', text(snippet.language), 4),
          field('Code', text(snippet.code), 2),
          field('Project', project.projectName ?? '', 2),
        ],
      ),
    );
  }

  for (const bug of bugs) {
    if (!bug || typeof bug.id !== 'string') continue;
    const project = projectOf(bug.projectId);
    const tags = tagsOf(bug.tagIds);
    index.push(
      entry(
        { type: 'bug', id: bug.id, title: text(bug.title) || 'Untitled bug', updatedAt: text(bug.updatedAt), tagIds: tags.tagIds, ...project },
        [
          field('Title', text(bug.title), 10),
          tags.field,
          field('Description', text(bug.description), 3),
          field('Status', BUG_STATUS_LABELS[bug.status] ?? '', 2),
          field('Priority', BUG_PRIORITY_LABELS[bug.priority] ?? '', 2),
          field('Project', project.projectName ?? '', 2),
        ],
      ),
    );
  }

  return index;
}

/* ---------- Matching ---------- */

/**
 * Every term must occur somewhere in the item (AND). Matches in the title
 * count most, a title that starts with the query even more.
 */
function scoreEntry(item: SearchIndexEntry, terms: string[], phrase: string): number | null {
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const candidate of item.fields) {
      if (candidate.lower.includes(term)) best = Math.max(best, candidate.weight);
    }
    if (best === 0) return null;
    score += best;
  }
  const title = item.fields[0];
  if (title && title.weight === 10) {
    if (title.lower === phrase) score += 20;
    else if (title.lower.startsWith(phrase)) score += 10;
    else if (title.lower.includes(phrase)) score += 5;
  }
  return score;
}

/** An excerpt of the first non-title field that contains a term. */
function contextFor(item: SearchIndexEntry, terms: string[]): { context: string | null; contextLabel: string | null } {
  for (const candidate of item.fields.slice(1)) {
    // The project name and the tags are already shown separately.
    if (candidate.label === 'Project' || candidate.label === 'Tags') continue;
    let position = -1;
    for (const term of terms) {
      const found = candidate.lower.indexOf(term);
      if (found !== -1 && (position === -1 || found < position)) position = found;
    }
    if (position === -1) continue;
    return { context: excerpt(candidate.text, position), contextLabel: candidate.label };
  }
  return { context: null, contextLabel: null };
}

export function excerpt(value: string, position: number): string {
  const start = Math.max(0, position - CONTEXT_BEFORE);
  const end = Math.min(value.length, start + CONTEXT_LENGTH);
  return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`;
}

export interface SearchOptions {
  /** Results shown per type; the group's `total` still counts all matches. */
  limitPerType?: number;
}

export function search(index: SearchIndex, rawQuery: unknown, { limitPerType = 6 }: SearchOptions = {}): SearchResults {
  const terms = parseQuery(rawQuery);
  if (terms.length === 0) return { terms, groups: [], total: 0 };
  const phrase = terms.join(' ');

  const byType = new Map<EntityType, SearchResult[]>(SEARCH_TYPES.map((type) => [type, []]));
  const seen = new Set<string>();
  for (const item of index) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    const score = scoreEntry(item, terms, phrase);
    if (score === null) continue;
    seen.add(key);
    byType.get(item.type)?.push({
      type: item.type,
      id: item.id,
      title: item.title,
      projectId: item.projectId,
      projectName: item.projectName,
      tagIds: item.tagIds,
      score,
      ...contextFor(item, terms),
    });
  }

  const updatedAt = new Map(index.map((item) => [`${item.type}:${item.id}`, item.updatedAt]));
  const groups: SearchGroup[] = [];
  let total = 0;
  for (const type of SEARCH_TYPES) {
    const matches = byType.get(type) ?? [];
    if (matches.length === 0) continue;
    matches.sort(
      (a, b) =>
        b.score - a.score ||
        (updatedAt.get(`${b.type}:${b.id}`) ?? '').localeCompare(updatedAt.get(`${a.type}:${a.id}`) ?? '') ||
        a.title.localeCompare(b.title),
    );
    groups.push({ type, results: matches.slice(0, limitPerType), total: matches.length });
    total += matches.length;
  }
  return { terms, groups, total };
}

/* ---------- Highlighting ---------- */

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Splits text into plain and matching parts, so the UI can mark matches without HTML strings. */
export function highlightSegments(value: string, terms: readonly string[]): TextSegment[] {
  if (value === '' || terms.length === 0) return value === '' ? [] : [{ text: value, match: false }];
  const lower = value.toLowerCase();
  // A few characters change length when lowercased; positions would no longer line up.
  if (lower.length !== value.length) return [{ text: value, match: false }];
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    if (term === '') continue;
    let from = lower.indexOf(term);
    while (from !== -1) {
      ranges.push([from, from + term.length]);
      from = lower.indexOf(term, from + term.length);
    }
  }
  if (ranges.length === 0) return [{ text: value, match: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: value.slice(cursor, start), match: false });
    segments.push({ text: value.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), match: false });
  return segments;
}

import type { BugPriority, BugStatus, EntityType, ProjectKind, ProjectStatus, TaskPriority, TaskStatus } from './models';
import { localized } from '../i18n/translate';

export const PROJECT_KIND_LABELS = localized<ProjectKind>({
  web: 'Web',
  software: 'Software',
  app: 'Mobile app',
  game: 'Game',
  roblox: 'Roblox',
  other: 'Other',
});

export const PROJECT_STATUS_LABELS = localized<ProjectStatus>({
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
});

export const TASK_STATUS_LABELS = localized<TaskStatus>({
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
});

export const TASK_PRIORITY_LABELS = localized<TaskPriority>({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
});

export const BUG_STATUS_LABELS = localized<BugStatus>({
  open: 'Open',
  in_progress: 'In progress',
  fixed: 'Fixed',
  closed: 'Closed',
});

export const BUG_PRIORITY_LABELS = localized<BugPriority>({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
});

export const ENTITY_LABELS = localized<EntityType>({
  project: 'Project',
  task: 'Task',
  note: 'Note',
  snippet: 'Snippet',
  bug: 'Bug',
});

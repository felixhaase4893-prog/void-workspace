import type { BugPriority, BugStatus, EntityType, ProjectKind, ProjectStatus, TaskPriority, TaskStatus } from './models';

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  web: 'Web',
  software: 'Software',
  app: 'Mobile app',
  game: 'Game',
  roblox: 'Roblox',
  other: 'Other',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  fixed: 'Fixed',
  closed: 'Closed',
};

export const BUG_PRIORITY_LABELS: Record<BugPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  project: 'Project',
  task: 'Task',
  note: 'Note',
  snippet: 'Snippet',
  bug: 'Bug',
};

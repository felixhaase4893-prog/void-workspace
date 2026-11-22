import type { BadgeTone } from '../../components/ui/Badge';
import type { ProjectStatus } from '../../domain/models';

export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = { active: 'success', paused: 'warning', archived: 'neutral' };

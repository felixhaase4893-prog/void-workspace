import type { TagColor } from '../../domain/models';

/**
 * Tag colours as complete class names (Tailwind only ships classes it can see
 * in the source). Light text on a faint tint keeps contrast high and the
 * palette calm next to the violet accent.
 */
export const TAG_CHIP_CLASSES: Record<TagColor | 'default', string> = {
  default: 'border-line-strong bg-raised text-muted',
  violet: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  blue: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  teal: 'border-teal-400/30 bg-teal-400/10 text-teal-200',
  green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  orange: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  red: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  pink: 'border-pink-400/30 bg-pink-400/10 text-pink-200',
  slate: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
};

export const TAG_SWATCH_CLASSES: Record<TagColor | 'default', string> = {
  default: 'bg-subtle',
  violet: 'bg-violet-400',
  blue: 'bg-sky-400',
  teal: 'bg-teal-400',
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  orange: 'bg-orange-400',
  red: 'bg-rose-400',
  pink: 'bg-pink-400',
  slate: 'bg-slate-400',
};

export const TAG_COLOR_LABELS: Record<TagColor | 'default', string> = {
  default: 'Default',
  violet: 'Violet',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  amber: 'Amber',
  orange: 'Orange',
  red: 'Red',
  pink: 'Pink',
  slate: 'Slate',
};

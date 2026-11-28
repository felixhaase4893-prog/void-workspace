import { formatBytes as formatEngineBytes } from '../../domain/optimizer/sizes';
import { getLocale } from '../../i18n/translate';

/** Sizes on the page follow the chosen language ("1.5 GB" / "1,5 GB"). */
export function formatBytes(value: number): string {
  return formatEngineBytes(value, getLocale());
}

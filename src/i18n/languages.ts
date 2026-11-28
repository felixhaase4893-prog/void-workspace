/**
 * The languages VOID speaks: the three most spoken native languages in the
 * world (Mandarin Chinese, Spanish, English) plus German.
 */
export const LANGUAGES = [
  { code: 'en', englishName: 'English', nativeName: 'English', locale: 'en-US' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', locale: 'es-ES' },
  { code: 'zh', englishName: 'Chinese (Simplified)', nativeName: '简体中文', locale: 'zh-CN' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', locale: 'de-DE' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

export const LANGUAGE_CODES = LANGUAGES.map((language) => language.code) as readonly Language[];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function languageInfo(code: Language) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

/** Picks a supported language from browser/system language tags ("de-AT" → "de"); English otherwise. */
export function detectLanguage(tags: readonly string[] | undefined): Language {
  for (const tag of tags ?? []) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

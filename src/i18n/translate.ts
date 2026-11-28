import type { MessageParams } from './define';
import { DEFAULT_LANGUAGE, languageInfo, type Language } from './languages';
import { CATALOG, type MessageKey } from './messages';

export type { MessageKey } from './messages';

/**
 * The active language lives here, outside React, so plain functions (labels,
 * formatters, the code rules) can translate too. The React side (I18nBoundary)
 * sets it and re-renders the pages when it changes.
 */
let current: Language = DEFAULT_LANGUAGE;

const COLUMN: Record<Exclude<Language, 'en'>, 0 | 1 | 2> = { es: 0, zh: 1, de: 2 };

export function setLanguage(language: Language): void {
  current = language;
}

export function getLanguage(): Language {
  return current;
}

/** The BCP 47 locale for numbers and dates in the active language ("de-DE" …). */
export function getLocale(): string {
  return languageInfo(current).locale;
}

function template(key: MessageKey): string {
  if (current === 'en') return key;
  const entry = (CATALOG as Readonly<Record<string, readonly string[] | undefined>>)[key];
  return entry?.[COLUMN[current]] || key;
}

function interpolate(text: string, params: MessageParams | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Translates an English message into the active language; unknown text stays English. */
export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(template(key), params);
}

/**
 * Plural-aware translation for "one|other" messages: picks the form with the
 * language's plural rules and fills {count}, formatted for the locale.
 */
export function tn(key: MessageKey, count: number, params?: MessageParams): string {
  const forms = template(key).split('|');
  const one = forms.length > 1 && new Intl.PluralRules(getLocale()).select(count) === 'one';
  const text = one ? forms[0] : forms[forms.length - 1];
  return interpolate(text ?? key, { count: count.toLocaleString(getLocale()), ...params });
}

/**
 * A label map whose values follow the active language: reading
 * PROJECT_STATUS_LABELS.active gives "Active", "Activo", "活跃" or "Aktiv".
 */
export function localized<K extends string | number>(labels: Readonly<Record<K, MessageKey>>): Readonly<Record<K, string>> {
  const result = {} as Record<K, string>;
  for (const key of Object.keys(labels)) {
    Object.defineProperty(result, key, { get: () => t(labels[key as K]), enumerable: true });
  }
  return result;
}

/** Formats a number for the active language ("1,234.5" / "1.234,5" …). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(getLocale(), options);
}

export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString(getLocale(), options);
}

export function formatDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleString(getLocale(), options);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** A cached Intl.DateTimeFormat for the active language. */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${getLocale()}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(getLocale(), options);
    dateFormats.set(key, format);
  }
  return format;
}

interface TextPattern {
  key: MessageKey;
  regex: RegExp;
  names: string[];
}

let patterns: TextPattern[] | null = null;
const translatedTexts = new Map<string, string>();

/** Every catalog message with {placeholders}, as an anchored regex; the most specific (longest literal text) first. */
function textPatterns(): TextPattern[] {
  if (patterns) return patterns;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  patterns = (Object.keys(CATALOG) as MessageKey[])
    .filter((key) => key.includes('{') && !key.includes('|'))
    .map((key) => {
      const parts = key.split(/\{(\w+)\}/);
      const names = parts.filter((_, index) => index % 2 === 1);
      const literal = parts.filter((_, index) => index % 2 === 0);
      const source = literal.map(escape).join('(.*?)');
      return { key, names, regex: new RegExp(`^${source}$`, 's'), weight: literal.join('').length };
    })
    .sort((a, b) => b.weight - a.weight)
    .map(({ key, names, regex }) => ({ key, names, regex }));
  return patterns;
}

const EN_NUMBER = /^\d{1,3}(?:,\d{3})*(?:\.(\d+))?$/;
const EN_SIZE = /^(\d{1,3}(?:,\d{3})*(?:\.(\d+))?) (B|KB|MB|GB|TB)$/;

/** Re-formats an English-formatted number ("1,234.5") or size ("1.5 GB") for the active language. */
function localizeNumber(value: string): string | null {
  const size = EN_SIZE.exec(value);
  const number = size ? null : EN_NUMBER.exec(value);
  const raw = size?.[1] ?? (number ? value : null);
  if (raw === null) return null;
  const digits = (size ? size[2] : number?.[1])?.length ?? 0;
  const formatted = formatNumber(Number(raw.replace(/,/g, '')), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return size ? `${formatted} ${size[3]}` : formatted;
}

/**
 * A placeholder value: numbers and sizes are re-formatted, phrases (with a
 * space, so identifiers like "Status" in code stay as they are) translated.
 */
function translateValue(value: string): string {
  const number = localizeNumber(value);
  if (number !== null) return number;
  return value.includes(' ') ? translateText(value) : value;
}

/**
 * Translates English text that was produced elsewhere (code analysis findings,
 * the optimizer's scan results): an exact catalog message, or one that matches
 * a message with placeholders ("Unused import "x"" → {name} = x). Text that
 * matches nothing stays English, e.g. compiler messages.
 */
export function translateText(text: string): string {
  if (current === 'en' || text === '') return text;
  if (text in CATALOG) return t(text as MessageKey);
  const cacheKey = `${current}|${text}`;
  const cached = translatedTexts.get(cacheKey);
  if (cached !== undefined) return cached;
  let result = text;
  for (const pattern of textPatterns()) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    const params: Record<string, string> = {};
    pattern.names.forEach((name, index) => {
      const value = match[index + 1] ?? '';
      params[name] = translateValue(value);
    });
    result = t(pattern.key, params);
    break;
  }
  translatedTexts.set(cacheKey, result);
  return result;
}

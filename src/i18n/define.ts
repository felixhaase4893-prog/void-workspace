/** Placeholder values for a message: "{count} tasks" → { count: 3 }. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * The English text is the key; each entry lists its Spanish, Chinese and German
 * translation, in that order. Plural messages use "one|other"
 * ("{count} task|{count} tasks"); a language without plural forms may give a
 * single form ("{count} 个任务").
 */
export type Translations = readonly [es: string, zh: string, de: string];
export type Catalog = Readonly<Record<string, Translations>>;

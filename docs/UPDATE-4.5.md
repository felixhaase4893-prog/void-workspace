# Update 4.5 – Languages

As of 2026-11-28.

## What is new

- VOID speaks **English, Español, 简体中文 (Simplified Chinese) and Deutsch** – the three most spoken languages worldwide plus German.
- **Settings → Language** (first section) switches the whole app instantly. On first start VOID picks the system language, otherwise English. The choice is saved with the other preferences.
- Everything VOID itself writes is translated: navigation, pages, dialogs, toasts, validation messages, reminders, statistics, the dashboard, Quick Add, search, the Code Tester (including every finding of the analysis) and the PC Optimizer (scan results, recommendations, step-by-step fixes, the dry-run report).
- Dates, times, numbers and file sizes follow the language (`1,234.5` / `1.234,5`, `1.5 GB` / `1,5 GB`).
- Chinese uses the Windows CJK fonts (Microsoft YaHei) as fallback.

## What stays as it is

- Your own content (project names, notes, code) is never translated.
- Messages that come straight from the TypeScript compiler stay English, except the most common ones.
- The Discord Rich Presence lines stay English, because other people see them.

## How it works

- No i18n library. The English text is the key; each catalog entry holds the Spanish, Chinese and German text (`src/i18n/messages/`).
- The Code Tester and the optimizer engine keep producing English (the engine also runs in the desktop backend). The page translates their texts when it shows them, including placeholders such as names, counts and sizes.
- Tests check every translation for placeholders, plural forms and duplicate keys, run the simulated optimizer and sample code in every analysed language, and fail if any text has no translation.

## Tests

`npm run check` green, 686 tests (15 new for languages).

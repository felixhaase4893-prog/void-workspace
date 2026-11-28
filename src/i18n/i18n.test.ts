import { afterEach, describe, expect, it } from 'vitest';

import { analyzeCode } from '../domain/code/analyze';
import { CODE_LANGUAGES, type CodeLanguageId } from '../domain/code/languages';
import { ACTION_CATALOG, CATEGORY_LABELS, REVERSIBILITY_LABELS, SAFETY_LABELS } from '../domain/optimizer/catalog';
import { OptimizerService } from '../domain/optimizer/service';
import { createSimulatedScannerSuite, SIMULATED_CONTEXT } from '../domain/optimizer/simulated';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { PREFERENCES_STORAGE_KEY, PreferencesRepository } from '../storage/preferences';
import { detectLanguage, LANGUAGES } from './languages';
import { AREAS, CATALOG } from './messages';
import { formatNumber, setLanguage, t, tn, translateText, type MessageKey } from './translate';

afterEach(() => setLanguage('en'));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('translation catalog', () => {
  const entries = Object.entries(CATALOG) as [string, readonly string[]][];

  it('has exactly one translation per language and no empty text', () => {
    for (const [key, translations] of entries) {
      expect(translations, key).toHaveLength(3);
      for (const text of translations) expect(text.trim(), key).not.toBe('');
    }
  });

  it('lists every English text in one area only', () => {
    const seen = new Map<string, string>();
    for (const [area, catalog] of Object.entries(AREAS)) {
      for (const key of Object.keys(catalog)) {
        expect(seen.get(key), `"${key}" is in ${seen.get(key)} and ${area}`).toBeUndefined();
        seen.set(key, area);
      }
    }
  });

  it('keeps every placeholder in every language', () => {
    for (const [key, translations] of entries) {
      const expected = [...new Set(placeholders(key))];
      for (const text of translations) expect([...new Set(placeholders(text))], `${key} → ${text}`).toEqual(expected);
    }
  });

  it('gives Spanish and German both plural forms (Chinese may use one)', () => {
    for (const [key, [es, zh, de]] of entries) {
      if (!key.includes('|') || !/\{count\}/.test(key)) continue;
      expect(es!.split('|'), `es: ${key}`).toHaveLength(2);
      expect(de!.split('|'), `de: ${key}`).toHaveLength(2);
      expect(zh!.split('|').length, `zh: ${key}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('t, tn and formatting', () => {
  it('returns English unchanged and translates the other languages', () => {
    expect(t('Settings')).toBe('Settings');
    setLanguage('de');
    expect(t('Settings')).toBe('Einstellungen');
    setLanguage('es');
    expect(t('Settings')).toBe('Ajustes');
    setLanguage('zh');
    expect(t('Settings')).toBe('设置');
  });

  it('picks the plural form and formats the count for the language', () => {
    expect(tn('{count} line|{count} lines', 1)).toBe('1 line');
    expect(tn('{count} line|{count} lines', 1200)).toBe('1,200 lines');
    setLanguage('de');
    expect(tn('{count} line|{count} lines', 1)).toBe('1 Zeile');
    expect(tn('{count} line|{count} lines', 1200)).toBe('1.200 Zeilen');
    expect(formatNumber(1234.5)).toBe('1.234,5');
  });
});

describe('detectLanguage', () => {
  it('uses the first supported browser language and falls back to English', () => {
    expect(detectLanguage(['de-AT', 'en'])).toBe('de');
    expect(detectLanguage(['fr-FR', 'es-MX'])).toBe('es');
    expect(detectLanguage(['zh-CN'])).toBe('zh');
    expect(detectLanguage(['fr-FR', 'ja'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(LANGUAGES.map((language) => language.code)).toEqual(['en', 'es', 'zh', 'de']);
  });
});

describe('the language preference', () => {
  it('is saved, and an unknown value falls back to the browser language', () => {
    const store = new MemoryKeyValueStore();
    const repository = new PreferencesRepository(store);
    repository.save({ ...repository.load(), language: 'zh' });
    expect(new PreferencesRepository(store).load().language).toBe('zh');
    store.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ language: 'klingon' }));
    expect(new PreferencesRepository(store).load().language).toBeUndefined();
  });
});

describe('translateText', () => {
  it('translates exact and templated messages and leaves unknown text alone', () => {
    setLanguage('de');
    expect(translateText('Unclosed string')).toBe('Nicht geschlossener String');
    expect(translateText('Unused import "useState"')).toBe('Ungenutzter Import "useState"');
    expect(translateText('Would remove 1,234 temporary files.')).toBe('Würde 1.234 temporäre Dateien entfernen.');
    expect(translateText('Estimated 1.5 GB.')).toBe('Geschätzt 1,5 GB.');
    expect(translateText("Property 'x' does not exist")).toBe("Property 'x' does not exist");
  });

  it('translates nested phrases inside a message', () => {
    setLanguage('es');
    expect(translateText('Starts automatically every time you sign in (Registry (current user)).')).toBe('Se inicia automáticamente cada vez que inicias sesión (Registro (usuario actual)).');
  });
});

/** Texts that are allowed to stay as they are: names, paths and code. */
const isNeutral = (text: string) => !/[a-z]{3,}/i.test(text.replace(/[A-Z]:\\\S*|%\w+%\S*|\S+\.(exe|dmp|wer|hdmp)\b|PID \d+/g, '')) || ['Discord', 'Spotify', 'GameClient', 'Info', 'Details', 'eval()', 'SELECT *', 'using namespace std'].includes(text) || /^console\.\w+$/.test(text);

function untranslated(texts: Iterable<string>): string[] {
  const missing = new Set<string>();
  for (const text of texts) {
    if (!text || isNeutral(text)) continue;
    // Unchanged in both German and Spanish means there is no catalog entry.
    const same = (['de', 'es'] as const).every((language) => {
      setLanguage(language);
      return translateText(text) === text;
    });
    setLanguage('en');
    if (same) missing.add(text);
  }
  return [...missing];
}

describe('engine texts have translations', () => {
  it('covers everything the simulated optimizer shows', async () => {
    const texts: string[] = [];
    for (const mode of ['quick', 'deep'] as const) {
      let id = 0;
      const api = new OptimizerService({ scanners: createSimulatedScannerSuite(), context: SIMULATED_CONTEXT, createId: () => `00000000-0000-4000-8000-${String((id += 1) + (mode === 'deep' ? 500 : 0)).padStart(12, '0')}`, now: () => new Date(2026, 10, 28, 12) });
      const scan = await api.startScan(mode);
      if (!scan.ok) throw new Error(scan.error.message);
      const preview = await api.createPreview(scan.value.scanId);
      if (!preview.ok) throw new Error(preview.error.message);
      const { system } = scan.value;
      texts.push(system?.cpuModel ?? '', system?.windowsVersion ?? '', system?.powerPlan?.name ?? '');
      for (const finding of scan.value.findings) texts.push(finding.title, finding.impact, finding.cause, ...finding.fixSteps, finding.openTarget?.label ?? '');
      for (const item of preview.value.recommendations) {
        const p = item.preview;
        texts.push(item.title, item.description, item.statusReason ?? '', item.openTarget?.label ?? '', p.found, p.why, p.changes, p.risks, p.reversibleNote, ...p.manualSteps);
      }
      const selectable = preview.value.recommendations.filter((item) => item.safety !== 'blocked').map((item) => item.id);
      await api.updateSelection(preview.value.previewId, selectable);
      const validated = await api.validatePreview(preview.value.previewId);
      if (validated.ok) texts.push(...(validated.value.validation?.warnings ?? []).map((warning) => warning.message));
      await api.confirmPreview(preview.value.previewId);
      const result = await api.executeDryRun(preview.value.previewId);
      if (result.ok) texts.push(result.value.message, ...result.value.actions.flatMap((action) => [action.title, action.plannedChange]));
    }
    for (const action of Object.values(ACTION_CATALOG)) texts.push(action.changes, action.risks, action.reversibleNote, ...action.manualSteps);
    texts.push(...Object.values(CATEGORY_LABELS), ...Object.values(SAFETY_LABELS), ...Object.values(REVERSIBILITY_LABELS));
    expect(untranslated(texts)).toEqual([]);
  });

  const SAMPLES: Partial<Record<CodeLanguageId, string>> = {
    javascript: 'import { a } from "x";\nvar y = 1;\nif (y == 2) { debugger; eval("1"); }\nconsole.log(y)\n// TODO fix\nfunction f(unused) { return 1; }\ntry { f() } catch (e) {}\n',
    typescript: 'const x: any = 1;\nlet z = 2;\nfunction g() { return; z = 3; }\n',
    python: 'import os\ndef f(a=[]):\n    if a is 1:\n        pass\n    try:\n        pass\n    except:\n        pass\ndef f():\n    return x == None\n',
    json: '{ "a": 1, "a": 2, \'b\': 3, }',
    html: '<html><body><img src="x"><div id="a"></div><div id="a"><center>x</center></div><p>unclosed</body></html>',
    css: 'a { color: red; color: blue; }\n.b {}\n',
    sql: 'DELETE FROM users;\nSELECT * FROM t WHERE a = NULL;\n',
    bash: 'rm -rf $DIR/\ncd /tmp\nif [ $x = 1 ]; then echo `date`; fi\n',
    yaml: 'a: 1\na: 2\n',
    java: 'class A { void f(String s) { if (s == "x") { } try { } catch (Exception e) { } } }',
    csharp: 'class A { async void Run() { } }',
    cpp: '#include <cstdio>\nusing namespace std;\nint main() { char b[8]; gets(b); return 0; }',
    ruby: 'puts 1',
    xml: '<a><b></a><c/>',
    php: '<?php\nmysql_query("x");\neval($code);\n',
  };

  it('covers the Code Tester findings and messages', async () => {
    const texts: string[] = [];
    for (const [language, code] of Object.entries(SAMPLES) as [CodeLanguageId, string][]) {
      for (const mode of ['quick', 'deep'] as const) {
        const outcome = await analyzeCode(code, language, mode);
        if (outcome.status === 'done') {
          // Parser messages from the TypeScript compiler stay English on purpose.
          for (const item of outcome.findings) texts.push(item.title, item.rule === 'syntax' ? '' : item.description, item.suggestion ?? '');
        } else if (outcome.status === 'unsupported') texts.push(outcome.reason);
      }
    }
    for (const language of CODE_LANGUAGES) texts.push(language.deepScanNote);
    expect(untranslated(texts)).toEqual([]);
  });
});

describe('message keys', () => {
  it('are typed so a missing translation is a compile error', () => {
    const key: MessageKey = 'Settings';
    expect(t(key)).toBe('Settings');
  });
});

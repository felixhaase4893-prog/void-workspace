import type { Plugin } from 'prettier';

import { getCodeLanguage, type CodeLanguageId } from './languages';

/**
 * Code formatting with Prettier, the formatter most JS/TS projects already
 * use. Only languages Prettier formats reliably are offered. The result is
 * never applied here: the Code Tester shows a preview and a diff first and
 * only replaces the code after the user confirms.
 *
 * Prettier and its language plugins are loaded on first use, one language at
 * a time, so they never slow down the start of VOID.
 */

export type FormatOutcome =
  | { status: 'formatted'; code: string; changed: boolean }
  | { status: 'unsupported'; reason: string }
  | { status: 'failed'; message: string; line: number | null };

type Formattable = 'javascript' | 'typescript' | 'json' | 'css' | 'scss' | 'html' | 'yaml';

const PARSERS: Record<Formattable, string> = {
  javascript: 'babel',
  typescript: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  yaml: 'yaml',
};

async function loadPlugins(language: Formattable): Promise<Plugin[]> {
  const estree = async () => (await import('prettier/plugins/estree')).default as Plugin;
  const babel = async () => (await import('prettier/plugins/babel')).default as Plugin;
  const postcss = async () => (await import('prettier/plugins/postcss')).default as Plugin;
  switch (language) {
    case 'javascript':
    case 'json':
      return Promise.all([babel(), estree()]);
    case 'typescript':
      return Promise.all([import('prettier/plugins/typescript').then((module) => module.default as Plugin), estree()]);
    case 'css':
    case 'scss':
      return [await postcss()];
    case 'html':
      // Inline <script> and <style> blocks are formatted too.
      return Promise.all([import('prettier/plugins/html').then((module) => module.default as Plugin), babel(), estree(), postcss()]);
    case 'yaml':
      return [(await import('prettier/plugins/yaml')).default as Plugin];
  }
}

export const FORMAT_SETTINGS = { printWidth: 100, tabWidth: 2, useTabs: false } as const;

function isFormattable(language: CodeLanguageId): language is Formattable {
  return language in PARSERS && getCodeLanguage(language).format;
}

export async function formatCode(code: string, language: CodeLanguageId): Promise<FormatOutcome> {
  if (!isFormattable(language)) {
    return {
      status: 'unsupported',
      reason: `Formatting is not available for ${getCodeLanguage(language).label}. VOID only formats languages it can format reliably: JavaScript, TypeScript, JSON, CSS, SCSS, HTML and YAML.`,
    };
  }
  if (code.trim() === '') return { status: 'formatted', code, changed: false };
  try {
    const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), loadPlugins(language)]);
    const formatted = await format(code, { parser: PARSERS[language], plugins, ...FORMAT_SETTINGS });
    return { status: 'formatted', code: formatted, changed: formatted !== code };
  } catch (error) {
    const location = (error as { loc?: { start?: { line?: number } } }).loc?.start?.line;
    const raw = error instanceof Error ? error.message : 'The formatter stopped unexpectedly.';
    // Prettier appends a code frame to its message; the first line is the readable part.
    const message = raw.split('\n')[0]?.replace(/\s*\(\d+:\d+\)\s*$/, '') ?? raw;
    return { status: 'failed', message: `The code could not be formatted: ${message}`, line: typeof location === 'number' ? location : null };
  }
}

import type { StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

import type { CodeLanguageId } from '../../domain/code/languages';

/**
 * CodeMirror language support, loaded one language at a time when it is
 * selected. Lezer grammars where CodeMirror has them, the classic stream
 * modes for the rest.
 */
async function legacy(load: () => Promise<StreamParser<unknown>>): Promise<Extension> {
  const [{ StreamLanguage }, mode] = await Promise.all([import('@codemirror/language'), load()]);
  return StreamLanguage.define(mode);
}

export async function loadEditorLanguage(language: CodeLanguageId): Promise<Extension> {
  switch (language) {
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true });
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true });
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    case 'css':
      return (await import('@codemirror/lang-css')).css();
    case 'scss':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/css')).sCSS);
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'java':
      return (await import('@codemirror/lang-java')).java();
    case 'csharp':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp);
    case 'cpp':
    case 'c':
      return (await import('@codemirror/lang-cpp')).cpp();
    case 'php':
      return (await import('@codemirror/lang-php')).php();
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql();
    case 'bash':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell);
    case 'powershell':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/powershell')).powerShell);
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml();
    case 'go':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/go')).go);
    case 'rust':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/rust')).rust);
    case 'kotlin':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).kotlin);
    case 'swift':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift);
    case 'lua':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/lua')).lua);
    case 'ruby':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby);
    case 'xml':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/xml')).xml);
    case 'toml':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/toml')).toml);
    case 'dockerfile':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile);
    case 'plaintext':
      return [];
  }
}

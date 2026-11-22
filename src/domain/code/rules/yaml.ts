import { finding, type Finding } from '../findings';

/** YAML forbids tabs in indentation; this is always an error, not a style question. */
export function yamlTabFindings(code: string): Finding[] {
  const findings: Finding[] = [];
  let inBlockScalar = false;
  let blockIndent = -1;
  code.split('\n').forEach((raw, index) => {
    const text = raw.replace(/\r$/, '');
    const indent = /^[ \t]*/.exec(text)?.[0] ?? '';
    if (inBlockScalar) {
      if (text.trim() === '' || indent.replace(/\t/g, '  ').length > blockIndent) return;
      inBlockScalar = false;
    }
    if (indent.includes('\t') && text.trim() !== '' && findings.length < 10) {
      findings.push(
        finding({
          rule: 'yaml-tab-indent',
          category: 'error',
          title: 'Tab in indentation',
          description: 'YAML does not allow tabs for indentation. Parsers reject this line.',
          line: index + 1,
          column: indent.indexOf('\t') + 1,
          suggestion: 'Indent with spaces.',
        }),
      );
    }
    if (/:\s*[|>][-+0-9]*\s*(#.*)?$/.test(text)) {
      inBlockScalar = true;
      blockIndent = indent.length;
    }
  });
  return findings;
}

/**
 * Duplicate keys in block mappings. Many YAML loaders keep only the last value
 * without a warning, so a repeated key silently drops configuration.
 */
export function yamlDuplicateKeyFindings(code: string): Finding[] {
  const findings: Finding[] = [];
  // Keys seen per indentation level of the current mapping chain.
  let levels: Array<{ indent: number; keys: Map<string, number> }> = [];
  let inBlockScalar = false;
  let blockIndent = -1;

  code.split('\n').forEach((raw, index) => {
    const text = raw.replace(/\r$/, '');
    const line = index + 1;
    if (/^(---|\.\.\.)(\s|$)/.test(text)) {
      levels = [];
      inBlockScalar = false;
      return;
    }
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    let indent = /^ */.exec(text)?.[0].length ?? 0;
    if (inBlockScalar) {
      if (indent > blockIndent) return;
      inBlockScalar = false;
    }

    let rest = text.slice(indent);
    let startsItem = false;
    while (/^-( +|$)/.test(rest)) {
      const dash = /^- */.exec(rest)?.[0] ?? '-';
      indent += dash.length;
      rest = rest.slice(dash.length);
      startsItem = true;
    }

    levels = levels.filter((level) => level.indent < indent || (level.indent === indent && !startsItem));
    const key = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"{[\]},&*!|>%@`-][^:#]*?|-[^\s:][^:#]*?)\s*:(?:\s|$)/.exec(rest);
    if (!key) return;
    const name = (key[1] as string).replace(/^["']|["']$/g, '');
    let level = levels[levels.length - 1];
    if (!level || level.indent !== indent) {
      level = { indent, keys: new Map() };
      levels.push(level);
    }
    const first = level.keys.get(name);
    if (first !== undefined && name !== '<<') {
      findings.push(
        finding({
          rule: 'yaml-duplicate-key',
          category: 'warning',
          title: `Duplicate key "${name}"`,
          description: `This mapping already has "${name}" on line ${first}. Most loaders keep only the last value.`,
          line,
          column: indent + 1,
          suggestion: 'Remove or rename one of the keys.',
        }),
      );
    } else level.keys.set(name, line);

    if (/:\s*[|>][-+0-9]*\s*(#.*)?$/.test(rest)) {
      inBlockScalar = true;
      blockIndent = indent;
    }
  });
  return findings;
}

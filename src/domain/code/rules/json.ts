import { finding, type Finding } from '../findings';
import { LineIndex } from '../scanner';

/**
 * A strict JSON reader (RFC 8259) that reports the exact line and column of
 * the first syntax error, plus duplicate keys, which JSON.parse silently
 * accepts by keeping the last value.
 */

class JsonError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly hint?: string,
  ) {
    super(message);
  }
}

interface Duplicate {
  key: string;
  offset: number;
  firstOffset: number;
}

export interface JsonCheck {
  error: { message: string; offset: number; hint?: string } | null;
  duplicates: Duplicate[];
  unsafeNumbers: number[];
}

export function checkJson(text: string): JsonCheck {
  let index = 0;
  const duplicates: Duplicate[] = [];
  const unsafeNumbers: number[] = [];

  const skipWhitespace = () => {
    while (index < text.length) {
      const char = text[index];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') index += 1;
      else if (char === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) throw new JsonError('Comments are not allowed in JSON', index, 'Remove the comment. JSON has no comment syntax.');
      else break;
    }
  };

  const describe = (char: string | undefined) => (char === undefined ? 'the end of the text' : `"${char}"`);

  const parseString = (): string => {
    const start = index;
    index += 1;
    let value = '';
    while (index < text.length) {
      const char = text[index] as string;
      if (char === '"') {
        index += 1;
        return value;
      }
      if (char === '\n') throw new JsonError('Unclosed string', start, 'Close the string with " before the line ends.');
      if (char.charCodeAt(0) < 0x20) throw new JsonError('Control character in string', index, 'Write it as an escape sequence like \\t.');
      if (char === '\\') {
        const next = text[index + 1];
        if (next === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) throw new JsonError('Invalid \\u escape', index, 'Use exactly four hex digits, e.g. \\u00e9.');
          value += String.fromCharCode(parseInt(text.slice(index + 2, index + 6), 16));
          index += 6;
          continue;
        }
        if (next === undefined || !'"\\/bfnrt'.includes(next)) throw new JsonError('Invalid escape sequence', index, 'Valid escapes are \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.');
        value += next;
        index += 2;
        continue;
      }
      value += char;
      index += 1;
    }
    throw new JsonError('Unclosed string', start, 'Close the string with ".');
  };

  const parseNumber = () => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match) throw new JsonError(`Unexpected ${describe(text[index])}`, index);
    const isInteger = !/[.eE]/.test(match[0]);
    if (isInteger && !Number.isSafeInteger(Number(match[0]))) unsafeNumbers.push(index);
    index += match[0].length;
  };

  const parseValue = (): void => {
    skipWhitespace();
    const char = text[index];
    if (char === '{') return parseObject();
    if (char === '[') return parseArray();
    if (char === '"') {
      parseString();
      return;
    }
    if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) return parseNumber();
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    if (char === "'") throw new JsonError('Single quotes are not allowed', index, 'JSON strings use double quotes.');
    if (char === undefined) throw new JsonError('Unexpected end of JSON', index, 'A value is missing here.');
    if (/[A-Za-z_]/.test(char)) {
      const word = /^[A-Za-z_]\w*/.exec(text.slice(index))?.[0] ?? char;
      throw new JsonError(`Unexpected word "${word}"`, index, word === 'undefined' || word === 'NaN' || word === 'Infinity' ? `${word} is not valid JSON. Use null.` : 'Text must be in double quotes.');
    }
    throw new JsonError(`Unexpected ${describe(char)}`, index);
  };

  const parseObject = () => {
    index += 1;
    const seen = new Map<string, number>();
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (text[index] !== '"') {
        if (text[index] === '}') throw new JsonError('Trailing comma', index - 1, 'Remove the comma before }.');
        throw new JsonError(text[index] === "'" ? 'Single quotes are not allowed' : 'Expected a property name in double quotes', index);
      }
      const keyOffset = index;
      const key = parseString();
      const first = seen.get(key);
      if (first !== undefined) duplicates.push({ key, offset: keyOffset, firstOffset: first });
      else seen.set(key, keyOffset);
      skipWhitespace();
      if (text[index] !== ':') throw new JsonError(`Expected ":" after the property name but found ${describe(text[index])}`, index);
      index += 1;
      parseValue();
      skipWhitespace();
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === '}') {
        index += 1;
        return;
      }
      throw new JsonError(`Expected "," or "}" but found ${describe(text[index])}`, index, text[index] === '"' ? 'A comma is probably missing before this property.' : undefined);
    }
  };

  const parseArray = () => {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (text[index] === ']') throw new JsonError('Trailing comma', index - 1, 'Remove the comma before ].');
      parseValue();
      skipWhitespace();
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === ']') {
        index += 1;
        return;
      }
      throw new JsonError(`Expected "," or "]" but found ${describe(text[index])}`, index);
    }
  };

  try {
    if (text.charCodeAt(0) === 0xfeff) index = 1;
    parseValue();
    skipWhitespace();
    if (index < text.length) throw new JsonError(`Unexpected ${describe(text[index])} after the end of the JSON value`, index, 'A JSON document holds exactly one value. Wrap several values in an array.');
    return { error: null, duplicates, unsafeNumbers };
  } catch (error) {
    if (error instanceof JsonError) return { error: { message: error.message, offset: error.offset, ...(error.hint ? { hint: error.hint } : {}) }, duplicates, unsafeNumbers };
    throw error;
  }
}

export function jsonFindings(code: string, deep: boolean): Finding[] {
  if (code.trim() === '') return [];
  const lines = new LineIndex(code);
  const result = checkJson(code);
  const findings: Finding[] = [];
  if (result.error) {
    const { line, column } = lines.locate(Math.min(result.error.offset, Math.max(0, code.length - 1)));
    findings.push(
      finding({
        rule: 'json-syntax',
        category: 'error',
        title: result.error.message,
        description: 'The JSON parser stopped here. Everything after this point was not checked.',
        line,
        column,
        ...(result.error.hint ? { suggestion: result.error.hint } : {}),
      }),
    );
  }
  if (deep) {
    for (const duplicate of result.duplicates) {
      const { line, column } = lines.locate(duplicate.offset);
      const first = lines.locate(duplicate.firstOffset);
      findings.push(
        finding({
          rule: 'json-duplicate-key',
          category: 'warning',
          title: `Duplicate key "${duplicate.key}"`,
          description: `The same key already appears on line ${first.line} in this object. Most parsers silently keep only the last value.`,
          line,
          column,
          suggestion: 'Remove or rename one of the keys.',
        }),
      );
    }
    for (const offset of result.unsafeNumbers) {
      const { line, column } = lines.locate(offset);
      findings.push(
        finding({
          rule: 'json-unsafe-integer',
          category: 'info',
          title: 'Number too large for JavaScript',
          description: 'Integers above 2^53 lose precision when JSON is read in JavaScript.',
          line,
          column,
          suggestion: 'Store large ids as strings.',
        }),
      );
    }
  }
  return findings;
}

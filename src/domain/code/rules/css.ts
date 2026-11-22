import { finding, type Finding } from '../findings';
import { LineIndex } from '../scanner';

/**
 * Declaration-level checks for CSS and SCSS on masked code (comments and
 * string contents blanked): repeated properties in one rule, empty rules.
 */
export function cssBlockFindings(masked: string): Finding[] {
  const lines = new LineIndex(masked);
  const findings: Finding[] = [];
  // Each open block keeps its own declarations: property → offset and value.
  const stack: Array<{ offset: number; declarations: Map<string, { offset: number; value: string }>; hasContent: boolean; selector: string }> = [];
  let segmentStart = 0;

  const flushDeclaration = (end: number) => {
    const block = stack[stack.length - 1];
    const segment = masked.slice(segmentStart, end);
    if (!block) return;
    if (segment.trim() !== '') block.hasContent = true;
    const match = /^\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:([\s\S]*)$/.exec(segment);
    if (!match) return;
    const property = (match[1] as string).toLowerCase();
    if (property.startsWith('--')) return;
    const value = (match[2] as string).replace(/\s+/g, ' ').trim();
    const offset = segmentStart + segment.indexOf(match[1] as string);
    const previous = block.declarations.get(property);
    if (previous) {
      const { line, column } = lines.locate(offset);
      const first = lines.locate(previous.offset).line;
      findings.push(
        previous.value === value
          ? finding({
              rule: 'css-duplicate-property',
              category: 'warning',
              title: `Duplicate "${property}"`,
              description: `The same declaration already appears on line ${first} in this rule.`,
              line,
              column,
              suggestion: 'Remove one of them.',
            })
          : finding({
              rule: 'css-repeated-property',
              category: 'info',
              title: `"${property}" is set twice`,
              description: `This rule already sets ${property} on line ${first}; the later value wins. That is fine for deliberate fallbacks.`,
              line,
              column,
            }),
      );
    }
    block.declarations.set(property, { offset, value });
  };

  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === '{') {
      const parent = stack[stack.length - 1];
      if (parent) parent.hasContent = true;
      const selector = masked.slice(segmentStart, index).trim();
      stack.push({ offset: index, declarations: new Map(), hasContent: false, selector });
      segmentStart = index + 1;
    } else if (char === ';') {
      flushDeclaration(index);
      segmentStart = index + 1;
    } else if (char === '}') {
      flushDeclaration(index);
      const block = stack.pop();
      if (block && !block.hasContent && block.selector !== '') {
        const { line, column } = lines.locate(block.offset);
        findings.push(
          finding({
            rule: 'css-empty-rule',
            category: 'info',
            title: 'Empty rule',
            description: `"${block.selector.slice(0, 60)}" has no declarations.`,
            line,
            column,
            suggestion: 'Remove it, or add the missing declarations.',
          }),
        );
      }
      segmentStart = index + 1;
    }
  }

  const important = (masked.match(/!important/gi) ?? []).length;
  if (important >= 5) {
    const first = masked.search(/!important/i);
    const { line, column } = lines.locate(first);
    findings.push(
      finding({
        rule: 'css-important',
        category: 'suggestion',
        title: `!important used ${important} times`,
        description: 'Frequent !important makes styles hard to override and to reason about.',
        line,
        column,
        suggestion: 'Prefer more specific selectors or cascade layers.',
      }),
    );
  }
  return findings;
}

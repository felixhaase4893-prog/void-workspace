import { useMemo } from 'react';

import { cn } from '../../lib/cn';
import { highlightCode } from '../../lib/highlight';

interface CodeBlockProps {
  code: string;
  /** Free-text language name, e.g. the snippet's language field. Unknown names show plain code. */
  language: string;
  className?: string;
}

/**
 * Read-only code with syntax highlighting. Tokens are rendered as text spans,
 * so code can never inject markup. Long lines scroll inside the block instead
 * of widening the layout (the parent must allow `min-w-0`).
 */
export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  return (
    <pre
      className={cn(
        'scrollbar-thin max-w-full min-w-0 overflow-auto font-mono text-[12.5px] leading-relaxed text-muted [font-variant-ligatures:none] [tab-size:2]',
        className,
      )}
      data-highlighted={tokens ? 'true' : 'false'}
    >
      <code className="hljs-code">
        {tokens
          ? tokens.map((token, index) =>
              token.classes.length > 0 ? (
                <span key={index} className={token.classes.join(' ')}>
                  {token.text}
                </span>
              ) : (
                token.text
              ),
            )
          : code}
      </code>
    </pre>
  );
}

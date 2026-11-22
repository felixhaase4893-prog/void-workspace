import { useMemo, type ReactNode } from 'react';

import { CodeBlock } from '../../components/code/CodeBlock';
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from '../../domain/markdown';
import { cn } from '../../lib/cn';

interface MarkdownViewProps {
  source: string;
  className?: string;
  /** Smaller headings and spacing, e.g. inside a note card. */
  compact?: boolean;
}

/**
 * Renders a note's Markdown as React elements. Nothing is ever inserted as
 * HTML: raw tags in a note show up as text, and only http(s) links become
 * clickable (they open outside VOID, in the system browser).
 */
export function MarkdownView({ source, className, compact = false }: MarkdownViewProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <div className={cn('min-w-0 text-[13px] leading-relaxed text-muted [overflow-wrap:anywhere]', className)}>{renderBlocks(blocks, compact, false)}</div>;
}

const HEADING_CLASSES = {
  full: ['text-lg', 'text-base', 'text-[15px]', 'text-sm', 'text-[13px]', 'text-[13px]'],
  compact: ['text-[15px]', 'text-sm', 'text-[13px]', 'text-[13px]', 'text-[13px]', 'text-[13px]'],
};

function renderBlocks(blocks: MarkdownBlock[], compact: boolean, tight: boolean): ReactNode[] {
  return blocks.map((block, index) => {
    const spacing = index === 0 ? '' : tight ? 'mt-1' : 'mt-2.5';
    switch (block.type) {
      case 'heading': {
        const Tag = `h${block.level}` as const;
        const size = (compact ? HEADING_CLASSES.compact : HEADING_CLASSES.full)[block.level - 1];
        return (
          <Tag key={index} className={cn(spacing, index > 0 && !tight && 'mt-4', 'font-semibold text-fg', size)}>
            {renderInline(block.children)}
          </Tag>
        );
      }
      case 'paragraph':
        return (
          <p key={index} className={spacing}>
            {renderInline(block.children)}
          </p>
        );
      case 'code':
        return (
          <CodeBlock
            key={index}
            code={block.text}
            language={block.language}
            className={cn(spacing, 'rounded-lg border border-line bg-canvas px-3 py-2 text-[12px]', compact ? 'max-h-40' : 'max-h-96')}
          />
        );
      case 'list': {
        const isTaskList = block.items.some((item) => item.checked !== null);
        const listClass = cn(spacing, 'space-y-1', isTaskList ? 'list-none pl-1' : block.ordered ? 'list-decimal pl-5' : 'list-disc pl-5', 'marker:text-subtle');
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex} className={cn('min-w-0', item.checked !== null && 'flex items-start gap-2')}>
            {item.checked !== null && (
              <input type="checkbox" checked={item.checked} readOnly disabled aria-label={item.checked ? 'Done' : 'Not done'} className="mt-[0.3em] shrink-0 accent-accent-500" />
            )}
            <div className={cn('min-w-0', item.checked === true && 'text-subtle line-through')}>{renderBlocks(item.children, compact, true)}</div>
          </li>
        ));
        return block.ordered ? (
          <ol key={index} start={block.start === 1 ? undefined : block.start} className={listClass}>
            {items}
          </ol>
        ) : (
          <ul key={index} className={listClass}>
            {items}
          </ul>
        );
      }
      case 'quote':
        return (
          <blockquote key={index} className={cn(spacing, 'border-l-2 border-accent-600/60 pl-3 text-subtle')}>
            {renderBlocks(block.children, compact, false)}
          </blockquote>
        );
      case 'rule':
        return <hr key={index} className={cn(spacing, 'my-3 border-line')} />;
    }
  });
}

function renderInline(nodes: MarkdownInline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'break':
        return <br key={index} />;
      case 'code':
        return (
          <code key={index} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.92em] text-accent-200 [font-variant-ligatures:none]">
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-fg">
            {renderInline(node.children)}
          </strong>
        );
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'del':
        return (
          <del key={index} className="text-subtle">
            {renderInline(node.children)}
          </del>
        );
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={node.href}
            className="text-accent-300 underline decoration-accent-600/50 underline-offset-2 hover:text-accent-200 hover:decoration-accent-300"
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

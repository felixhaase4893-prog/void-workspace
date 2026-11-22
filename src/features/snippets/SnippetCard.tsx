import { FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CodeBlock } from '../../components/code/CodeBlock';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import type { Snippet } from '../../domain/models';
import { ItemActions } from '../create/ItemActions';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { TagList } from '../tags/TagList';
import { CopyButton } from './CopyButton';

export function SnippetCard({ snippet, projectName = null }: { snippet: Snippet; projectName?: string | null }) {
  const meta = [projectName, snippet.description].filter(Boolean).join(' · ');
  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-fg">{snippet.title}</h2>
            <Badge tone="accent" className="max-w-[10rem] min-w-0 shrink-0">
              <span className="truncate">{snippet.language}</span>
            </Badge>
          </div>
          {meta && <p className="mt-0.5 truncate text-xs text-subtle">{meta}</p>}
          <TagList tagIds={snippet.tagIds} max={5} className="mt-1.5" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <FavoriteButton type="snippet" id={snippet.id} title={snippet.title} favorite={snippet.favorite} />
          <CopyButton text={snippet.code} label={`Copy ${snippet.title}`} />
          <Link
            to={`/code-tester?snippet=${encodeURIComponent(snippet.id)}`}
            aria-label={`Open ${snippet.title} in the Code Tester`}
            title="Open in the Code Tester"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg [&_svg]:size-4"
          >
            <FlaskConical aria-hidden="true" />
          </Link>
          <ItemActions type="snippet" id={snippet.id} title={snippet.title} className="-mr-2" />
        </div>
      </div>
      <CodeBlock code={snippet.code} language={snippet.language} className="max-h-56 flex-1 border-t border-line bg-canvas px-4 py-3" />
    </Card>
  );
}

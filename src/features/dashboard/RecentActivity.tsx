import { Link } from 'react-router-dom';

import { ENTITY_ICONS, entityPath } from '../../app/navigation';
import { Card, CardHeader } from '../../components/ui/Card';
import { ENTITY_LABELS } from '../../domain/labels';
import type { Workspace } from '../../domain/models';
import { getRecentItems } from '../../domain/workspace';
import { formatRelativeTime } from '../../lib/format';

export function RecentActivity({ workspace }: { workspace: Workspace }) {
  const items = getRecentItems(workspace, 6);
  const now = new Date();

  return (
    <Card>
      <CardHeader title="Recently edited" />
      {items.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nothing edited yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const Icon = ENTITY_ICONS[item.type];
            return (
              <li key={`${item.type}-${item.id}`}>
                <Link to={entityPath(item.type, item.id)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-raised/60">
                  <Icon className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{item.title}</span>
                    <span className="block text-xs text-subtle">{ENTITY_LABELS[item.type]}</span>
                  </span>
                  <time dateTime={item.updatedAt} className="shrink-0 font-mono text-[11px] text-subtle">
                    {formatRelativeTime(item.updatedAt, now)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

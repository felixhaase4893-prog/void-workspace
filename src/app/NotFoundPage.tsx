import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { buttonClasses } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <Card>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={Compass}
        title="Lost in the void"
        description="This page does not exist. It may have moved, or the link is wrong."
        action={
          <Link to="/" className={buttonClasses('secondary')}>
            Back to dashboard
          </Link>
        }
      />
    </Card>
  );
}

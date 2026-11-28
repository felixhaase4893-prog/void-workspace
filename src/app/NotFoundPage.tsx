import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { buttonClasses } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { t } from '../i18n/translate';

export function NotFoundPage() {
  return (
    <Card>
      <h1 className="sr-only">{t('Page not found')}</h1>
      <EmptyState
        icon={Compass}
        title={t('Lost in the void')}
        description={t('This page does not exist. It may have moved, or the link is wrong.')}
        action={
          <Link to="/" className={buttonClasses('secondary')}>
            {t('Back to dashboard')}
          </Link>
        }
      />
    </Card>
  );
}

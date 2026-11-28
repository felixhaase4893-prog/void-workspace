import { Trash2 } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/toastContext';
import { MAX_SEARCH_HISTORY } from '../../domain/searchHistory';
import { useSearchHistory } from '../search/useSearchHistory';
import { SettingsSection } from './SettingsSection';
import { t, tn } from '../../i18n/translate';

/** Whether recent searches are kept, and a way to forget them. */
export function SearchHistorySection() {
  const { enabled, history, clear, setEnabled } = useSearchHistory();
  const { showToast } = useToast();
  return (
    <SettingsSection title={t('Search')} description={t('Up to {max} recent searches are kept on this device, only after you opened a result.', { max: MAX_SEARCH_HISTORY })}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <Toggle
            label={t('Remember recent searches')}
            description={enabled ? (history.length === 0 ? t('Nothing remembered yet.') : tn('{count} search remembered.|{count} searches remembered.', history.length)) : t('Off. Nothing is stored.')}
            checked={enabled}
            onChange={setEnabled}
          />
        </div>
        <Button
          size="sm"
          icon={<Trash2 />}
          disabled={history.length === 0}
          onClick={() => {
            clear();
            showToast(t('Search history cleared.'));
          }}
        >
          {t('Clear history')}
        </Button>
      </div>
    </SettingsSection>
  );
}

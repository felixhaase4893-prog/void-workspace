import { Trash2 } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/toastContext';
import { MAX_SEARCH_HISTORY } from '../../domain/searchHistory';
import { useSearchHistory } from '../search/useSearchHistory';
import { SettingsSection } from './SettingsSection';

/** Whether recent searches are kept, and a way to forget them. */
export function SearchHistorySection() {
  const { enabled, history, clear, setEnabled } = useSearchHistory();
  const { showToast } = useToast();
  return (
    <SettingsSection title="Search" description={`Up to ${MAX_SEARCH_HISTORY} recent searches are kept on this device, only after you opened a result.`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <Toggle
            label="Remember recent searches"
            description={enabled ? (history.length === 0 ? 'Nothing remembered yet.' : `${history.length} remembered.`) : 'Off. Nothing is stored.'}
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
            showToast('Search history cleared.');
          }}
        >
          Clear history
        </Button>
      </div>
    </SettingsSection>
  );
}

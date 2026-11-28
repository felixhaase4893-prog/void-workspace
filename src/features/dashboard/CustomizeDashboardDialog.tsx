import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';

import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import {
  DASHBOARD_CARD_HINTS,
  DASHBOARD_CARD_LABELS,
  DEFAULT_DASHBOARD_LAYOUT,
  isDefaultDashboardLayout,
  moveDashboardCard,
  setDashboardCardVisible,
  type DashboardLayout,
} from '../../domain/dashboardLayout';
import { cn } from '../../lib/cn';
import { useDashboardLayout } from './useDashboardLayout';
import { t } from '../../i18n/translate';

/** Show, hide and reorder the dashboard cards. Every change applies and is saved right away. */
export function CustomizeDashboardDialog({ onClose }: { onClose: () => void }) {
  const { layout, setLayout } = useDashboardLayout();
  const { showToast } = useToast();

  const apply = (update: (current: DashboardLayout) => DashboardLayout) => {
    if (!setLayout(update)) showToast(t('Changed for now, but the layout could not be saved on this device.'), 'warning');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Customize dashboard')}
      description={t('Choose which cards to show and in which order. Saved on this device.')}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw />}
            className="mr-auto"
            disabled={isDefaultDashboardLayout(layout)}
            onClick={() => apply(() => DEFAULT_DASHBOARD_LAYOUT)}
          >
            {t('Restore default')}
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('Done')}
          </Button>
        </>
      }
    >
      <ol aria-label={t('Dashboard cards')} className="divide-y divide-line rounded-lg border border-line">
        {layout.order.map((card, index) => {
          const visible = !layout.hidden.includes(card);
          const label = DASHBOARD_CARD_LABELS[card];
          return (
            <li key={card} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) => apply((current) => setDashboardCardVisible(current, card, event.target.checked))}
                  className="mt-0.5 size-4 shrink-0 accent-accent-500"
                />
                <span className="min-w-0">
                  <span className={cn('block text-[13px] font-medium', visible ? 'text-fg' : 'text-subtle')}>{label}</span>
                  <span className="block truncate text-xs text-subtle">{DASHBOARD_CARD_HINTS[card]}</span>
                </span>
              </label>
              <div className="flex shrink-0 items-center">
                <IconButton
                  label={t('Move {label} up', { label })}
                  className="size-8 [&_svg]:size-4"
                  disabled={index === 0}
                  onClick={() => apply((current) => moveDashboardCard(current, card, -1))}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={t('Move {label} down', { label })}
                  className="size-8 [&_svg]:size-4"
                  disabled={index === layout.order.length - 1}
                  onClick={() => apply((current) => moveDashboardCard(current, card, 1))}
                >
                  <ArrowDown />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}

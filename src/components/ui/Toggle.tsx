import { useId, type ReactNode } from 'react';

interface ToggleProps {
  label: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onChange: (checked: boolean) => void;
}

/** A labelled switch. It is a real checkbox underneath, so keyboard and screen readers just work. */
export function Toggle({ label, description, checked, disabled = false, badge, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg">
          {label}
          {badge}
        </label>
        <p id={`${id}-description`} className="mt-0.5 text-xs text-subtle">
          {description}
        </p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={`${id}-description`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-raised transition-colors before:absolute before:top-0.5 before:left-0.5 before:size-3.5 before:rounded-full before:bg-subtle before:transition-transform checked:border-accent-500 checked:bg-accent-500 checked:before:translate-x-4 checked:before:bg-white focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

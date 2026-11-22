import { ShieldCheck } from 'lucide-react';

import { LogoMark } from '../../components/brand/Logo';
import { QuickActions } from './QuickActions';

/** First-run state: explains VOID and offers the five ways to start. */
export function WelcomePanel() {
  return (
    <section aria-labelledby="welcome-heading" className="animate-rise">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-10 sm:px-10 sm:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full border border-line opacity-80 [box-shadow:0_0_0_40px_var(--color-surface),0_0_0_41px_var(--color-line),0_0_0_90px_var(--color-surface),0_0_0_91px_var(--color-line)]"
        />
        <div className="relative max-w-xl">
          <LogoMark className="mb-6 size-10" />
          <h2 id="welcome-heading" className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            Your workspace is empty. Let&apos;s fill the void.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            VOID keeps your projects, tasks, technical notes and reusable snippets in one calm place, whether you ship web apps, games or Roblox experiences.
            Pick something to start with.
          </p>
          <p className="mt-5 flex items-center gap-2 text-xs text-subtle">
            <ShieldCheck className="size-4 text-accent-300" aria-hidden="true" />
            No account, no cloud. Everything stays on this device.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <QuickActions />
      </div>
    </section>
  );
}

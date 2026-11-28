import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from '../components/ui/Dialog';
import { APP_VERSION } from '../lib/appInfo';
import { renderApp } from '../test/renderApp';

describe('VOID 4.3 polish', () => {
  it('shows the app version in Settings, taken from package.json', async () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(version).toBe('4.5.0');
    expect(APP_VERSION).toBe(version);
    renderApp({ route: '/settings' });
    const storage = (await screen.findByRole('heading', { name: 'Storage' })).closest('section')!;
    expect(within(storage).getByText('VOID version').nextElementSibling).toHaveTextContent('4.5.0');
  });

  it('starts every page at the top', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderApp({ route: '/settings' });
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    scrollTo.mockClear();
    await user.click(within(screen.getAllByRole('navigation')[0]!).getByRole('link', { name: /Tasks/ }));
    await screen.findByRole('heading', { name: 'Tasks', level: 1 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it('uses the same switch for every on/off setting', async () => {
    renderApp({ route: '/settings' });
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    for (const name of [/Desktop notifications/, /Discord Rich Presence/, /Show time used/, /Remember recent searches/]) {
      expect(screen.getByRole('switch', { name })).toBeInTheDocument();
    }
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('closes only the top dialog on Escape and keeps the page locked until the last one closes', async () => {
    const user = userEvent.setup();
    function Nested() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(false);
      return (
        <>
          <Dialog open={outer} onClose={() => setOuter(false)} title="Outer">
            <button type="button" onClick={() => setInner(true)}>
              Open inner
            </button>
          </Dialog>
          <Dialog open={inner} onClose={() => setInner(false)} title="Inner">
            <p>Are you sure?</p>
          </Dialog>
        </>
      );
    }
    render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Open inner' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('remembers the window size and position, and keeps the window reachable', () => {
    const main = readFileSync('electron/main.cjs', 'utf8');
    expect(main).toContain("WINDOW_STATE_FILE = 'window-state.json'");
    expect(main).toContain('saveWindowState(window)');
    expect(main).toMatch(/getAllDisplays\(\)\.some/);
  });

  it('loads the Code Tester in the background after start, without blocking it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      const idle = vi.fn((callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 });
        return 1;
      });
      vi.stubGlobal('requestIdleCallback', idle);
      renderApp();
      await screen.findByRole('heading', { level: 1 });
      expect(idle).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3000);
      expect(idle).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

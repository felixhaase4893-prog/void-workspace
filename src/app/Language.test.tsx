import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage } from '../i18n/translate';
import { renderApp } from '../test/renderApp';

afterEach(() => setLanguage('en'));

describe('VOID 4.5 languages', () => {
  it('switches the whole app from Settings and remembers the choice', async () => {
    const user = userEvent.setup();
    const { store, unmount } = renderApp({ route: '/settings' });
    await screen.findByRole('heading', { name: 'Settings', level: 1 });

    await user.click(screen.getByRole('radio', { name: /Deutsch/ }));
    expect(await screen.findByRole('heading', { name: 'Einstellungen', level: 1 })).toBeInTheDocument();
    expect(within(screen.getAllByRole('navigation')[0]!).getByRole('link', { name: /Aufgaben/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de-DE');

    await user.click(screen.getByRole('radio', { name: /Español/ }));
    expect(await screen.findByRole('heading', { name: 'Ajustes', level: 1 })).toBeInTheDocument();

    unmount();
    renderApp({ route: '/settings', store });
    expect(await screen.findByRole('heading', { name: 'Ajustes', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Español/ })).toBeChecked();
  });

  it('offers English, Spanish, Chinese and German', async () => {
    renderApp({ route: '/settings' });
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    for (const name of [/English/, /Español/, /简体中文/, /Deutsch/]) expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /English/ })).toBeChecked();
  });
});

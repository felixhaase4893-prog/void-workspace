import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../app/App';
import { KeyValueWorkspaceRepository } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore, type KeyValueStore } from '../storage/keyValueStore';
import { PreferencesRepository } from '../storage/preferences';

interface RenderAppOptions {
  route?: string;
  store?: KeyValueStore;
  /** Where reminder settings and the sent-reminder log live. Defaults to the same store. */
  preferences?: PreferencesRepository;
}

/** Renders the full app against an in-memory store that tests can inspect and reuse. */
export function renderApp({ route = '/', store = new MemoryKeyValueStore(), preferences = new PreferencesRepository(store) }: RenderAppOptions = {}) {
  const repository = new KeyValueWorkspaceRepository({ store, events: null });
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <App repository={repository} preferences={preferences} />
    </MemoryRouter>,
  );
  return { ...view, store, repository, preferences };
}

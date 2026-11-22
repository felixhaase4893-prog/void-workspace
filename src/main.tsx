import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './styles/index.css';
import { App } from './app/App';
import { createDefaultRepository } from './storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore, getBrowserStore } from './storage/keyValueStore';
import { PreferencesRepository } from './storage/preferences';
import { markStartup } from './lib/startupMarks';

markStartup('void:script-start');

const { repository, warning } = createDefaultRepository(getBrowserStore, () => new MemoryKeyValueStore());
const browserStore = getBrowserStore();
const preferences = new PreferencesRepository(browserStore.ok ? browserStore.value : new MemoryKeyValueStore());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App repository={repository} storageWarning={warning} preferences={preferences} />
    </BrowserRouter>
  </StrictMode>,
);

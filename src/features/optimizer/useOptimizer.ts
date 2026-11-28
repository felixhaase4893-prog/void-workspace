import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExecutionResult, OptimizerError, PreviewState, ScanMode, ScanResult } from '../../domain/optimizer/models';
import { computeSelectionTotals, defaultSelection, selectAllSafe, toggleSelection } from '../../domain/optimizer/preview';
import type { OptimizerClient } from './optimizerClient';

export type OptimizerPhase = 'idle' | 'scanning' | 'preview' | 'validating' | 'running' | 'done';

export interface OptimizerState {
  phase: OptimizerPhase;
  scan: ScanResult | null;
  preview: PreviewState | null;
  result: ExecutionResult | null;
  history: ExecutionResult[];
  error: OptimizerError | null;
  /** Mode of the running or last scan. */
  scanMode: ScanMode;
}

const INITIAL: OptimizerState = { phase: 'idle', scan: null, preview: null, result: null, history: [], error: null, scanMode: 'quick' };

/** The page's view of a selection change, before the backend answered: same totals, validation reset. */
function optimistic(preview: PreviewState, selectedIds: string[]): PreviewState {
  return { ...preview, selectedIds, totals: computeSelectionTotals(preview, selectedIds), validationStatus: 'unchecked', validation: null, confirmedAt: null };
}

/**
 * State of the optimizer page. Selection changes are shown instantly (totals
 * are computed locally from the preview's segments) and then stored in the
 * backend; only the newest answer is applied, so fast clicks never flicker.
 */
export function useOptimizer(client: OptimizerClient) {
  const [state, setState] = useState<OptimizerState>(INITIAL);
  const selectionRequest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback((patch: Partial<OptimizerState> | ((current: OptimizerState) => Partial<OptimizerState>)) => {
    if (!mounted.current) return;
    setState((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
  }, []);

  const loadHistory = useCallback(async () => {
    const response = await client.api.getHistory();
    if (response.ok) update({ history: response.value });
  }, [client, update]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const scan = useCallback(async (mode: ScanMode = 'quick') => {
    update({ phase: 'scanning', error: null, result: null, preview: null, scan: null, scanMode: mode });
    const scanned = await client.api.startScan(mode);
    if (!scanned.ok) return update({ phase: 'idle', error: scanned.error });
    const preview = await client.api.createPreview(scanned.value.scanId);
    if (!preview.ok) return update({ phase: 'idle', scan: scanned.value, error: preview.error });
    update({ phase: 'preview', scan: scanned.value, preview: preview.value });
  }, [client, update]);

  const applySelection = useCallback(
    async (selectedIds: string[]) => {
      const preview = state.preview;
      if (!preview) return;
      const request = ++selectionRequest.current;
      update({ preview: optimistic(preview, selectedIds), error: null });
      const response = await client.api.updateSelection(preview.previewId, selectedIds);
      if (request !== selectionRequest.current) return;
      if (response.ok) update({ preview: response.value });
      else update({ preview, error: response.error });
    },
    [client, state.preview, update],
  );

  const toggle = useCallback(
    (id: string, selected: boolean) => {
      if (!state.preview) return;
      void applySelection(toggleSelection(state.preview.recommendations, state.preview.selectedIds, id, selected));
    },
    [applySelection, state.preview],
  );

  const selectSafe = useCallback(() => {
    if (state.preview) void applySelection(selectAllSafe(state.preview.recommendations, state.preview.selectedIds));
  }, [applySelection, state.preview]);

  const resetSelection = useCallback(() => {
    if (state.preview) void applySelection(defaultSelection(state.preview.recommendations));
  }, [applySelection, state.preview]);

  const validate = useCallback(async () => {
    const preview = state.preview;
    if (!preview) return null;
    update({ phase: 'validating', error: null });
    const response = await client.api.validatePreview(preview.previewId);
    if (!response.ok) {
      update({ phase: 'preview', error: response.error });
      return null;
    }
    update({ phase: 'preview', preview: response.value });
    return response.value;
  }, [client, state.preview, update]);

  /** Confirmation, then the dry run. Neither changes anything on the PC. */
  const confirmAndSimulate = useCallback(async () => {
    const preview = state.preview;
    if (!preview) return;
    update({ phase: 'running', error: null });
    const confirmed = await client.api.confirmPreview(preview.previewId);
    if (!confirmed.ok) return update({ phase: 'preview', error: confirmed.error });
    const result = await client.api.executeDryRun(preview.previewId);
    if (!result.ok) {
      // A failed re-check marks the preview; fetch its new state so the page shows why.
      const refreshed = await client.api.validatePreview(preview.previewId);
      return update({ phase: 'preview', error: result.error, ...(refreshed.ok ? { preview: refreshed.value } : {}) });
    }
    update({ phase: 'done', preview: confirmed.value, result: result.value });
    void loadHistory();
  }, [client, loadHistory, state.preview, update]);

  const cancel = useCallback(() => {
    selectionRequest.current += 1;
    update({ phase: 'idle', preview: null, result: null, error: null });
  }, [update]);

  const dismissError = useCallback(() => update({ error: null }), [update]);

  const backToPreview = useCallback(() => update((current) => ({ phase: current.preview ? 'preview' : 'idle', result: null })), [update]);

  return { state, scan, toggle, selectSafe, resetSelection, validate, confirmAndSimulate, cancel, dismissError, backToPreview };
}

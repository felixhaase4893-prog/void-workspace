import type { z } from 'zod';

import {
  executionResultSchema,
  previewStateSchema,
  scanResultSchema,
  type OptimizerResponse,
} from '../../domain/optimizer/models';
import { OptimizerService, type OptimizerApi } from '../../domain/optimizer/service';
import { createSimulatedScannerSuite, SIMULATED_CONTEXT } from '../../domain/optimizer/simulated';
import { getDesktopBridge } from '../../lib/desktop';

/**
 * Where the page gets its optimizer from:
 * - desktop: the backend in the Electron main process (real, read-only scan)
 * - demo: a local service with simulated data, in a normal browser where VOID cannot see the PC
 */
export type OptimizerMode = 'desktop' | 'demo';

export interface OptimizerClient {
  mode: OptimizerMode;
  api: OptimizerApi;
  /** One-click "Open" (desktop only). Takes a fixed target id, never a path. */
  openTarget: ((id: string) => Promise<boolean>) | null;
}

const invalid = { ok: false as const, error: { code: 'internal' as const, message: 'The answer from the optimizer was invalid.' } };

/** Checks every answer from the main process against the schema before the page uses it. */
async function checked<T>(call: Promise<OptimizerResponse<unknown>>, schema: z.ZodType<T>): Promise<OptimizerResponse<T>> {
  try {
    const response = await call;
    if (!response || typeof response !== 'object') return invalid;
    if (!response.ok) return response;
    const parsed = schema.safeParse(response.value);
    return parsed.success ? { ok: true, value: parsed.data } : invalid;
  } catch {
    return { ok: false, error: { code: 'unavailable', message: 'The optimizer cannot be reached.' } };
  }
}

export function wrapBridge(bridge: OptimizerApi): OptimizerApi {
  return {
    startScan: (mode) => checked(bridge.startScan(mode === 'deep' ? 'deep' : 'quick'), scanResultSchema),
    createPreview: (scanId) => checked(bridge.createPreview(scanId), previewStateSchema),
    updateSelection: (previewId, ids) => checked(bridge.updateSelection(previewId, ids), previewStateSchema),
    validatePreview: (previewId) => checked(bridge.validatePreview(previewId), previewStateSchema),
    confirmPreview: (previewId) => checked(bridge.confirmPreview(previewId), previewStateSchema),
    executeDryRun: (previewId) => checked(bridge.executeDryRun(previewId), executionResultSchema),
    getHistory: () => checked(bridge.getHistory(), executionResultSchema.array()),
  };
}

export function createOptimizerClient(): OptimizerClient {
  const bridge = getDesktopBridge()?.optimizer;
  if (bridge) {
    const open = bridge.openTarget;
    return {
      mode: 'desktop',
      api: wrapBridge(bridge),
      openTarget: open ? (id) => open(id).then((result) => result === true, () => false) : null,
    };
  }
  return { mode: 'demo', api: new OptimizerService({ scanners: createSimulatedScannerSuite(), context: SIMULATED_CONTEXT }), openTarget: null };
}

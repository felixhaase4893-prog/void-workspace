import { t } from '../i18n/translate';
export type StorageError =
  | { kind: 'unavailable'; message: string }
  | { kind: 'corrupt'; message: string }
  | { kind: 'invalid'; message: string; issues: string[] }
  | { kind: 'unsupported-version'; message: string; version: number }
  | { kind: 'quota-exceeded'; message: string }
  | { kind: 'write-failed'; message: string };

export type StorageErrorKind = StorageError['kind'];

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export function toWriteError(error: unknown): StorageError {
  if (isQuotaExceeded(error)) {
    return {
      kind: 'quota-exceeded',
      message: t('The browser storage quota is full. Export your data and free up space.'),
    };
  }
  return { kind: 'write-failed', message: t('Saving failed: {reason}', { reason: describe(error) }) };
}

export function toReadError(error: unknown): StorageError {
  return { kind: 'unavailable', message: t('Browser storage could not be read: {reason}', { reason: describe(error) }) };
}

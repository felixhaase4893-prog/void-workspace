import type { BigIntStats, Dirent } from 'node:fs';
import { promises as nodeFs } from 'node:fs';

/**
 * The only file system functions the optimizer may use. The scanners get
 * this object instead of `fs`, so writing, deleting or moving is not even
 * reachable from their code.
 */
export interface ReadOnlyFs {
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  lstat(path: string, options: { bigint: true }): Promise<BigIntStats>;
  realpath(path: string): Promise<string>;
}

export const readOnlyFs: ReadOnlyFs = Object.freeze({
  readdir: (path: string, options: { withFileTypes: true }) => nodeFs.readdir(path, options),
  lstat: (path: string, options: { bigint: true }) => nodeFs.lstat(path, options),
  realpath: (path: string) => nodeFs.realpath(path),
});

import { createContext, useContext } from 'react';

import type { AnalysisOutcome } from '../../domain/code/analyze';
import type { CodeLanguageId } from '../../domain/code/languages';

/**
 * The Code Tester's working state. It lives in memory for as long as VOID is
 * open, so switching pages does not throw code away, but it is never written
 * to disk: scratch code is gone when VOID closes, unless it was saved as a
 * snippet. Saved code is linked to its snippet, so "Save" updates it.
 */
export interface CodeTesterState {
  code: string;
  language: CodeLanguageId;
  /** The snippet this code was loaded from or saved to; `null` in scratch mode. */
  snippetId: string | null;
  /** The code as it was last loaded or saved; `null` while nothing was saved. */
  savedCode: string | null;
  wrap: boolean;
  outcome: AnalysisOutcome | null;
  /** The code the outcome belongs to, so results can be marked as outdated after edits. */
  analyzedCode: string | null;
  /** Set right after formatting was accepted, so the original can be restored. */
  formatBackup: { original: string; formatted: string } | null;
}

export const INITIAL_CODE_TESTER_STATE: CodeTesterState = {
  code: '',
  language: 'javascript',
  snippetId: null,
  savedCode: null,
  wrap: false,
  outcome: null,
  analyzedCode: null,
  formatBackup: null,
};

/** Unsaved means: there is code, and it differs from what was last saved (scratch code is always unsaved). */
export function hasUnsavedCode(state: Pick<CodeTesterState, 'code' | 'savedCode'>): boolean {
  if (state.savedCode === null) return state.code.trim() !== '';
  return state.code !== state.savedCode;
}

export interface CodeTesterSessionValue {
  state: CodeTesterState;
  update: (change: Partial<CodeTesterState> | ((state: CodeTesterState) => Partial<CodeTesterState>)) => void;
  reset: () => void;
}

export const CodeTesterSessionContext = createContext<CodeTesterSessionValue | null>(null);

export function useCodeTesterSession(): CodeTesterSessionValue {
  const value = useContext(CodeTesterSessionContext);
  if (!value) throw new Error('useCodeTesterSession must be used inside <CodeTesterSessionProvider>.');
  return value;
}

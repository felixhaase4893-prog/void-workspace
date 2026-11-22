import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CodeTesterSessionContext, hasUnsavedCode, INITIAL_CODE_TESTER_STATE, type CodeTesterSessionValue, type CodeTesterState } from './codeTesterSession';

/**
 * Keeps the Code Tester's state while VOID runs (see CodeTesterState). It is
 * tiny on purpose: the editor and analysis code load only with the page.
 * While there is unsaved code, closing the window asks first.
 */
export function CodeTesterSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CodeTesterState>(INITIAL_CODE_TESTER_STATE);

  const update = useCallback<CodeTesterSessionValue['update']>((change) => {
    setState((current) => ({ ...current, ...(typeof change === 'function' ? change(current) : change) }));
  }, []);
  const reset = useCallback(() => setState(INITIAL_CODE_TESTER_STATE), []);

  const unsaved = hasUnsavedCode(state);
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  const value = useMemo(() => ({ state, update, reset }), [state, update, reset]);
  return <CodeTesterSessionContext.Provider value={value}>{children}</CodeTesterSessionContext.Provider>;
}

import { useState } from 'react';
import type { z } from 'zod';

/** Text fields hold any string while typing, whatever literal type they started with. */
type Editable<Values> = { [K in keyof Values]: Values[K] extends string ? string : Values[K] };

/**
 * Small form state helper: raw values in (mostly strings), validated schema
 * output out. Field errors come from the first Zod issue for each top-level key.
 */
export function useZodForm<Output, Values extends Record<string, unknown>>(schema: z.ZodType<Output>, initialValues: Values) {
  type Key = keyof Values & string;
  const [values, setValues] = useState<Editable<Values>>(initialValues as Editable<Values>);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});

  const setValue = <K extends Key>(key: K, value: Editable<Values>[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const validate = (): Output | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const next: Partial<Record<Key, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && key in values && next[key as Key] === undefined) {
        next[key as Key] = issue.message;
      }
    }
    setErrors(next);
    return null;
  };

  return { values, errors, setValue, validate };
}

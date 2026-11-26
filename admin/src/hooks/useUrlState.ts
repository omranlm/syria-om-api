import {useCallback, useMemo, useTransition} from 'react';
import {useSearchParams} from 'react-router';

type Value = string | number;

/**
 * Page state (filters, sorting, page) kept in the URL, so a view can be bookmarked, shared and restored
 * with the back button. Values equal to their default are left out of the URL. Changing anything but the
 * page itself returns to page 1.
 */
export function useUrlState<S extends Record<string, Value>>(defaults: S) {
  const [params, setParams] = useSearchParams();
  const [pending, startTransition] = useTransition();

  const state = useMemo(() => {
    const out = {...defaults};
    for (const key of Object.keys(defaults) as (keyof S)[]) {
      const raw = params.get(key as string);
      if (raw === null) continue;
      const def = defaults[key];
      if (typeof def === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) out[key] = n as S[keyof S];
      } else {
        out[key] = raw as S[keyof S];
      }
    }
    return out;
    // defaults is a literal per call site: compare it by value.
  }, [params, JSON.stringify(defaults)]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (patch: Partial<S>) => {
      startTransition(() => {
        setParams(
          prev => {
            const next = new URLSearchParams(prev);
            const resetPage = !('page' in patch) && 'page' in defaults;
            const merged: Record<string, Value | undefined> = {...patch};
            if (resetPage) merged.page = undefined;
            for (const [k, v] of Object.entries(merged)) {
              if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
              else next.set(k, String(v));
            }
            return next;
          },
          {replace: true},
        );
      });
    },
    [setParams, defaults],
  );

  return [state, update, pending] as const;
}

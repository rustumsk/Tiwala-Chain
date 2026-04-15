import { useCallback, useEffect, useState } from "react";

export const SESSION_STRING_UPDATED_EVENT = "tiwala:session-string-updated";

/**
 * Keeps a string UI choice in sessionStorage so refresh restores the same tab/filter.
 */
export function usePersistedSessionString<T extends string>(
  storageKey: string,
  defaultValue: T,
  allowed: readonly T[]
): [T, (value: T) => void] {
  const [state, setStateInternal] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return defaultValue;
      return allowed.includes(raw as T) ? (raw as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setState = useCallback(
    (value: T) => {
      if (!allowed.includes(value)) return;
      setStateInternal(value);
    },
    [allowed]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(storageKey, state);
      window.dispatchEvent(
        new CustomEvent(SESSION_STRING_UPDATED_EVENT, {
          detail: { key: storageKey, value: state },
        })
      );
    } catch {
      /* ignore quota */
    }
  }, [storageKey, state]);

  return [state, setState];
}

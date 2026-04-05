"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";

interface UseLocalStorageStateOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

function resolveInitialValue<T>(initialValue: T | (() => T)): T {
  return initialValue instanceof Function ? initialValue() : initialValue;
}

export function useLocalStorageState<T>(
  key: string | null,
  initialValue: T | (() => T),
  options: UseLocalStorageStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options;
  const [state, setState] = useState<T>(() => resolveInitialValue(initialValue));
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!key || typeof window === "undefined") {
      setState(resolveInitialValue(initialValue));
      setIsHydrated(true);
      return;
    }

    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        setState(deserialize(stored));
      } else {
        setState(resolveInitialValue(initialValue));
      }
    } catch {
      setState(resolveInitialValue(initialValue));
    } finally {
      setIsHydrated(true);
    }
  }, [key, deserialize]);

  useEffect(() => {
    if (!isHydrated || !key || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, serialize(state));
    } catch {
      // Ignore quota/storage failures; this hook is a best-effort cache only.
    }
  }, [isHydrated, key, serialize, state]);

  return [state, setState, isHydrated];
}

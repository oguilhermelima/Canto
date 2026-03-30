"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "canto:direct-search";

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

function getServerSnapshot(): boolean {
  return true;
}

export function useDirectSearch(): {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
} {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    emitChange();
  }, []);

  return { enabled, setEnabled };
}

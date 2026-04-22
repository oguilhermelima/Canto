"use client";

import { useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";

const STORAGE_KEY = "canto:direct-search";

function readLocalStorage(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function useDirectSearch(): {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
} {
  const utils = trpc.useUtils();
  const { data, isSuccess } = trpc.auth.getUserPreferences.useQuery(undefined, {
    staleTime: 60_000,
  });
  const mutation = trpc.auth.setUserPreferences.useMutation({
    onSuccess: () => void utils.auth.getUserPreferences.invalidate(),
  });

  // Sync DB value to localStorage when query resolves
  const syncedRef = useRef(false);
  useEffect(() => {
    if (isSuccess && !syncedRef.current) {
      syncedRef.current = true;
      localStorage.setItem(STORAGE_KEY, String(data.directSearchEnabled));
    }
  }, [isSuccess, data]);

  // Derive value: prefer DB value once loaded, fall back to localStorage
  const enabled = data?.directSearchEnabled ?? readLocalStorage();

  const setEnabled = useCallback(
    (value: boolean) => {
      // Immediate localStorage update for UI responsiveness
      localStorage.setItem(STORAGE_KEY, String(value));
      // Optimistically update the query cache
      utils.auth.getUserPreferences.setData(undefined, (prev) => ({
        watchRegion: prev?.watchRegion ?? null,
        directSearchEnabled: value,
        isPublic: prev?.isPublic ?? false,
      }));
      // Persist to DB
      mutation.mutate({ directSearchEnabled: value });
    },
    [mutation, utils],
  );

  return { enabled, setEnabled };
}

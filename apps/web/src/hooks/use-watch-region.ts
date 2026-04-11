"use client";

import { useCallback, useEffect, useRef } from "react";
import { trpc } from "~/lib/trpc/client";

const STORAGE_KEY = "canto:watch-region";
const DEFAULT_REGION = "US";

function readLocalStorage(): string {
  if (typeof window === "undefined") return DEFAULT_REGION;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_REGION;
}

export function useWatchRegion(): {
  region: string;
  setRegion: (region: string) => void;
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
    if (isSuccess && data && !syncedRef.current) {
      syncedRef.current = true;
      if (data.watchRegion) {
        localStorage.setItem(STORAGE_KEY, data.watchRegion);
      }
    }
  }, [isSuccess, data]);

  // Derive region: prefer DB value once loaded, fall back to localStorage
  const region = data?.watchRegion ?? readLocalStorage();

  const setRegion = useCallback(
    (newRegion: string) => {
      // Immediate localStorage update for UI responsiveness
      localStorage.setItem(STORAGE_KEY, newRegion);
      // Optimistically update the query cache
      utils.auth.getUserPreferences.setData(undefined, (prev) => ({
        watchRegion: newRegion,
        directSearchEnabled: prev?.directSearchEnabled ?? true,
        isPublic: prev?.isPublic ?? false,
      }));
      // Persist to DB
      mutation.mutate({ watchRegion: newRegion });
    },
    [mutation, utils],
  );

  return { region, setRegion };
}

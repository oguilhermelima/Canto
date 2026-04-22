"use client";

import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

interface HideParams {
  externalId: number | string;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath?: string | null;
}

export function useHiddenMedia(): {
  hiddenSet: Set<string>;
  isHidden: (externalId: number | string, provider?: string) => boolean;
  hide: (params: HideParams) => void;
  unhide: (externalId: number | string, provider?: string) => void;
  isPending: boolean;
} {
  const utils = trpc.useUtils();
  const { data: hiddenIds } = trpc.userMedia.getHiddenIds.useQuery(undefined, {
    staleTime: 60_000,
  });

  const hiddenSet = useMemo(() => {
    const set = new Set<string>();
    for (const row of hiddenIds ?? []) {
      set.add(`${row.provider}-${row.externalId}`);
    }
    return set;
  }, [hiddenIds]);

  const isHidden = useCallback(
    (externalId: number | string, provider = "tmdb") =>
      hiddenSet.has(`${provider}-${externalId}`),
    [hiddenSet],
  );

  const hideMutation = trpc.userMedia.hideMedia.useMutation({
    onSuccess: () => {
      void utils.userMedia.getHiddenIds.invalidate();
      void utils.userMedia.getHiddenMedia.invalidate();
      void utils.userMedia.getUserMediaCounts.invalidate();
      toast.success("Hidden from recommendations");
    },
    onError: (err) => toast.error(err.message),
  });

  const unhideMutation = trpc.userMedia.unhideMedia.useMutation({
    onSuccess: () => {
      void utils.userMedia.getHiddenIds.invalidate();
      void utils.userMedia.getHiddenMedia.invalidate();
      void utils.userMedia.getUserMediaCounts.invalidate();
      toast.success("Item restored");
    },
    onError: (err) => toast.error(err.message),
  });

  const hide = useCallback(
    (params: HideParams) => {
      const eid = typeof params.externalId === "string"
        ? parseInt(params.externalId, 10)
        : params.externalId;
      // Optimistic update
      utils.userMedia.getHiddenIds.setData(undefined, (prev) => [
        ...(prev ?? []),
        { externalId: eid, provider: params.provider },
      ]);
      hideMutation.mutate({
        externalId: eid,
        provider: params.provider,
        type: params.type,
        title: params.title,
        posterPath: params.posterPath,
      });
    },
    [hideMutation, utils],
  );

  const unhide = useCallback(
    (externalId: number | string, provider = "tmdb") => {
      const eid = typeof externalId === "string"
        ? parseInt(externalId, 10)
        : externalId;
      // Optimistic update
      utils.userMedia.getHiddenIds.setData(undefined, (prev) =>
        (prev ?? []).filter((r) => !(r.externalId === eid && r.provider === provider)),
      );
      unhideMutation.mutate({ externalId: eid, provider });
    },
    [unhideMutation, utils],
  );

  return {
    hiddenSet,
    isHidden,
    hide,
    unhide,
    isPending: hideMutation.isPending || unhideMutation.isPending,
  };
}

"use client";

import { useCallback, useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@canto/api";
import { trpc } from "@/lib/trpc/client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type SearchResult = RouterOutputs["torrent"]["search"]["results"][number];

/**
 * Stable dedupe key for cross-indexer merging. Prefers the magnet
 * info-hash since the same release uploaded to two indexers will share
 * the hash even if the titles differ in casing or trailing tags.
 * Falls back to lowercased title for results without a magnet URL
 * (rare — usually .torrent files where the hash isn't surfaced yet).
 */
function dedupeKey(r: SearchResult): string {
  if (r.magnetUrl) {
    const match = /xt=urn:btih:([a-zA-Z0-9]+)/i.exec(r.magnetUrl);
    if (match?.[1]) return `hash:${match[1].toLowerCase()}`;
  }
  return `title:${r.title.toLowerCase()}`;
}

export type IndexerStatus = {
  id: string;
  name: string;
  status: "pending" | "success" | "error";
  /** Result count from this indexer alone, after scoring + filter. */
  count: number;
  /** Indexer roundtrip time in ms (null until the response arrives). */
  tookMs: number | null;
  errorMessage: string | null;
};

export interface TorrentSearchStreamData {
  results: SearchResult[];
  hasMore: boolean;
}

interface UseTorrentSearchStreamArgs {
  mediaId: string;
  query?: string;
  seasonNumber?: number;
  episodeNumbers?: number[] | null;
  pageSize: number;
}

interface UseTorrentSearchStreamOptions {
  enabled: boolean;
}

export interface UseTorrentSearchStreamReturn {
  indexers: IndexerStatus[];
  /** Merged + deduped + sorted results from every indexer that has
   *  responded so far. Undefined while the very first response is in
   *  flight; defined (possibly empty) once at least one indexer has
   *  returned, regardless of whether the rest are still loading. */
  data: TorrentSearchStreamData | undefined;
  /** True until the first successful indexer response. After that we
   *  always have *some* data, even if the slow indexers haven't
   *  resolved — the UI renders the partial set and shows pending chips
   *  for the rest. */
  isLoading: boolean;
  /** True while at least one indexer query is still in flight. Drives
   *  the per-indexer chip statuses on the scanning state. */
  isAnyPending: boolean;
  /** True only when *every* indexer errored — partial-failure cases
   *  are reflected through `indexers[].status` instead. */
  isError: boolean;
  errorMessage?: string;
  refetch: () => void;
}

/**
 * Drives the per-indexer streaming search UI. Hits
 * `torrent.listIndexers` to learn which sources are enabled, then fans
 * out one parallel `torrent.searchOnIndexer` query per indexer via
 * tRPC's `useQueries`. The merged + deduped + sorted result set updates
 * progressively as each indexer responds, so a slow indexer can no
 * longer block the fast ones.
 */
export function useTorrentSearchStream(
  args: UseTorrentSearchStreamArgs,
  options: UseTorrentSearchStreamOptions,
): UseTorrentSearchStreamReturn {
  const indexerListQuery = trpc.torrent.listIndexers.useQuery(undefined, {
    enabled: options.enabled,
    staleTime: 60_000,
  });
  const indexerList = useMemo(
    () => indexerListQuery.data ?? [],
    [indexerListQuery.data],
  );

  const queries = trpc.useQueries((t) =>
    indexerList.map((idx) =>
      t.torrent.searchOnIndexer(
        {
          mediaId: args.mediaId,
          indexerId: idx.id,
          query: args.query,
          seasonNumber: args.seasonNumber,
          episodeNumbers: args.episodeNumbers,
          page: 0,
          pageSize: args.pageSize,
        },
        {
          enabled: options.enabled && indexerList.length > 0,
          retry: 1,
          staleTime: 0,
        },
      ),
    ),
  );

  const indexers: IndexerStatus[] = useMemo(
    () =>
      indexerList.map((idx, i) => {
        const q = queries[i];
        if (!q) {
          return {
            id: idx.id,
            name: idx.name,
            status: "pending",
            count: 0,
            tookMs: null,
            errorMessage: null,
          };
        }
        const status: IndexerStatus["status"] = q.isError
          ? "error"
          : q.isSuccess
            ? "success"
            : "pending";
        return {
          id: idx.id,
          name: idx.name,
          status,
          count: q.data?.results.length ?? 0,
          tookMs: q.data?.tookMs ?? null,
          errorMessage: q.error?.message ?? null,
        };
      }),
    [indexerList, queries],
  );

  // Merge fingerprint: changes whenever any per-indexer query's data or
  // status changes. Using dataUpdatedAt + status keeps the memo cheap.
  const queryFingerprint = queries
    .map((q) => `${q.status}:${q.dataUpdatedAt}`)
    .join("|");

  const merged = useMemo<TorrentSearchStreamData | undefined>(() => {
    if (queries.length === 0) return undefined;

    const anySuccess = queries.some((q) => q.isSuccess);
    const everyDone = queries.every((q) => !q.isLoading);
    // Wait for the first response before returning data — otherwise the
    // UI would flicker from "scanning" to "no results" to "results".
    if (!anySuccess && !everyDone) return undefined;

    const all: SearchResult[] = [];
    let hasMore = false;
    for (const q of queries) {
      if (!q.data) continue;
      all.push(...q.data.results);
      if (q.data.results.length >= args.pageSize) hasMore = true;
    }

    const seen = new Set<string>();
    const deduped: SearchResult[] = [];
    for (const r of all) {
      const key = dedupeKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    deduped.sort((a, b) => b.confidence - a.confidence);
    return { results: deduped, hasMore };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFingerprint, args.pageSize]);

  const isLoading =
    indexerListQuery.isLoading ||
    (indexerList.length > 0 && merged === undefined);
  const isAnyPending = queries.some((q) => q.isLoading);
  const isError =
    queries.length > 0 && queries.every((q) => q.isError);
  const errorMessage = queries.find((q) => q.error)?.error?.message;

  const refetch = useCallback(() => {
    void indexerListQuery.refetch();
    queries.forEach((q) => {
      void q.refetch();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFingerprint]);

  return {
    indexers,
    data: merged,
    isLoading,
    isAnyPending,
    isError,
    errorMessage,
    refetch,
  };
}

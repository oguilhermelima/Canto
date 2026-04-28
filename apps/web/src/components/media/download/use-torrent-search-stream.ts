"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@canto/api";
import { trpc } from "@/lib/trpc/client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type SearchResult = RouterOutputs["torrent"]["search"]["results"][number];

/**
 * Stable dedupe key for cross-indexer + cross-page merging. Prefers the
 * magnet info-hash since the same release uploaded to two indexers (or
 * fetched on overlapping pages from the same indexer) shares the hash
 * even if the titles differ in casing or trailing tags. Falls back to
 * lowercased title for results without a magnet URL.
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
  /** Result count from this indexer across every fetched page, after
   *  scoring + filter. */
  count: number;
  /** Page-0 indexer roundtrip time in ms (null until response arrives).
   *  Drives the chip latency display — later pages aren't shown to
   *  avoid replacing a "0.4s" with "1.2s" when the user scrolls. */
  tookMs: number | null;
  errorMessage: string | null;
};

export interface TorrentSearchStreamData {
  results: SearchResult[];
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
  /** Merged + deduped + sorted results from every indexer × page that
   *  has responded so far. Undefined while the very first response is
   *  in flight; defined (possibly empty) once at least one indexer has
   *  returned, regardless of whether the rest are still loading. */
  data: TorrentSearchStreamData | undefined;
  /** True until the first successful page-0 response. */
  isLoading: boolean;
  /** True while at least one page-0 query is still in flight. Drives
   *  the per-indexer chip statuses on the scanning state. */
  isAnyPending: boolean;
  /** True only when *every* page-0 query errored. */
  isError: boolean;
  errorMessage?: string;
  /** True when at least one indexer's most-recently-fetched page came
   *  back full (`results.length >= pageSize`) — there's likely more to
   *  fetch. Drives the infinite-scroll sentinel. */
  hasMore: boolean;
  /** True while the queries for the most recently requested page are
   *  still in flight. Distinct from {@link isLoading} which only covers
   *  the very first scan. */
  isLoadingMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/**
 * Drives the per-indexer streaming + infinite-scroll search UI. Hits
 * `torrent.listIndexers` to learn which sources are enabled, then fans
 * out one parallel `torrent.searchOnIndexer` query per (indexer × page)
 * via tRPC's `useQueries`. The merged + deduped + sorted result set
 * updates progressively as each indexer responds, and {@link loadMore}
 * bumps every indexer one page forward in a single batch — slow
 * indexers can no longer block fast ones.
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

  const [pageCount, setPageCount] = useState(1);

  // Reset to page-0-only whenever the search args change. The fingerprint
  // covers every input that changes the result set so the user can't
  // accidentally carry a deep page index across a query change.
  const argsKey = `${args.mediaId}|${args.query ?? ""}|${args.seasonNumber ?? ""}|${(args.episodeNumbers ?? []).join(",")}`;
  useEffect(() => {
    setPageCount(1);
  }, [argsKey]);

  const N = indexerList.length;

  // Layout: [p0i0, p0i1, ..., p0i(N-1), p1i0, p1i1, ..., p(K-1)i(N-1)]
  // Page-outer keeps slicing to "latest page" trivial.
  const queries = trpc.useQueries((t) =>
    Array.from({ length: pageCount }, (_, page) =>
      indexerList.map((idx) =>
        t.torrent.searchOnIndexer(
          {
            mediaId: args.mediaId,
            indexerId: idx.id,
            query: args.query,
            seasonNumber: args.seasonNumber,
            episodeNumbers: args.episodeNumbers,
            page,
            pageSize: args.pageSize,
          },
          {
            enabled: options.enabled && N > 0,
            retry: 1,
            staleTime: 0,
          },
        ),
      ),
    ).flat(),
  );

  const indexers: IndexerStatus[] = useMemo(
    () =>
      indexerList.map((idx, i) => {
        const page0 = queries[i];
        let count = 0;
        for (let p = 0; p < pageCount; p++) {
          const q = queries[p * N + i];
          if (q?.data) count += q.data.results.length;
        }
        const status: IndexerStatus["status"] = page0?.isError
          ? "error"
          : page0?.isSuccess
            ? "success"
            : "pending";
        return {
          id: idx.id,
          name: idx.name,
          status,
          count,
          tookMs: page0?.data?.tookMs ?? null,
          errorMessage: page0?.error?.message ?? null,
        };
      }),
    [indexerList, queries, pageCount, N],
  );

  // Merge fingerprint changes whenever any query's data or status changes.
  // dataUpdatedAt + status keeps the memo cheap.
  const queryFingerprint = queries
    .map((q) => `${q.status}:${q.dataUpdatedAt}`)
    .join("|");

  const merged = useMemo<TorrentSearchStreamData | undefined>(() => {
    if (queries.length === 0) return undefined;

    // Wait for the first page-0 response before returning data —
    // otherwise the UI flickers from "scanning" to "no results" to
    // "results".
    const page0 = queries.slice(0, N);
    const anySuccess = page0.some((q) => q.isSuccess);
    const everyDone = page0.every((q) => !q.isLoading);
    if (!anySuccess && !everyDone) return undefined;

    const all: SearchResult[] = [];
    for (const q of queries) {
      if (q.data) all.push(...q.data.results);
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
    return { results: deduped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFingerprint, N]);

  // hasMore: any indexer's most-recent page came back full.
  const hasMore = useMemo(() => {
    if (pageCount === 0 || N === 0) return false;
    const start = (pageCount - 1) * N;
    for (let i = 0; i < N; i++) {
      const q = queries[start + i];
      if (q?.data && q.data.results.length >= args.pageSize) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFingerprint, pageCount, N, args.pageSize]);

  const isLoadingMore = useMemo(() => {
    if (pageCount <= 1) return false;
    const start = (pageCount - 1) * N;
    for (let i = 0; i < N; i++) {
      const q = queries[start + i];
      if (q?.isLoading) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFingerprint, pageCount, N]);

  const loadMore = useCallback(() => {
    setPageCount((c) => c + 1);
  }, []);

  const isLoading =
    indexerListQuery.isLoading || (N > 0 && merged === undefined);
  const isAnyPending = queries.slice(0, N).some((q) => q.isLoading);
  const isError =
    N > 0 && queries.slice(0, N).every((q) => q.isError);
  const errorMessage = queries.find((q) => q.error)?.error?.message;

  const refetch = useCallback(() => {
    setPageCount(1);
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
    hasMore,
    isLoadingMore,
    loadMore,
    refetch,
  };
}

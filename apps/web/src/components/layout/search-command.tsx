"use client";

import { useCallback, useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Skeleton } from "@canto/ui/skeleton";
import { Search, Star, Film, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommand({
  open,
  onOpenChange,
}: SearchCommandProps): React.JSX.Element {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const movieSearch = trpc.media.search.useQuery(
    { query, type: "movie", provider: "tmdb" },
    {
      enabled: query.length >= 2,
      placeholderData: keepPreviousData,
    },
  );

  const showSearch = trpc.media.search.useQuery(
    { query, type: "show", provider: "tmdb" },
    {
      enabled: query.length >= 2,
      placeholderData: keepPreviousData,
    },
  );

  const isLoading = movieSearch.isLoading || showSearch.isLoading;
  const data =
    movieSearch.data && showSearch.data
      ? {
          results: [
            ...movieSearch.data.results,
            ...showSearch.data.results,
          ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)),
        }
      : movieSearch.data ?? showSearch.data;

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleSelect = useCallback(
    (externalId: string, provider: string, type: string) => {
      onOpenChange(false);
      setQuery("");
      router.push(
        `/media/ext?provider=${provider}&externalId=${externalId}&type=${type}`,
      );
    },
    [onOpenChange, router],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-neutral-200 bg-white p-0">
        <DialogTitle className="sr-only">Search media</DialogTitle>
        <div className="flex items-center border-b border-neutral-200 px-4">
          <Search className="mr-2 h-5 w-5 shrink-0 text-neutral-400" />
          <Input
            placeholder="Search movies and shows..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 border-0 bg-transparent text-base text-black placeholder:text-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {query.length < 2 && (
            <div className="p-8 text-center text-sm text-neutral-500">
              Type at least 2 characters to search...
            </div>
          )}

          {isLoading && query.length >= 2 && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-16 w-11 shrink-0 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && data?.results && data.results.length === 0 && (
            <div className="p-8 text-center text-sm text-neutral-500">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {!isLoading && data?.results && data.results.length > 0 && (
            <div className="p-2">
              {data.results.slice(0, 8).map((result) => (
                <button
                  key={`${result.provider}-${result.externalId}`}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-50"
                  onClick={() =>
                    handleSelect(
                      String(result.externalId),
                      result.provider,
                      result.type,
                    )
                  }
                >
                  <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-neutral-100">
                    {result.posterPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w500${result.posterPath}`}
                        alt={result.title}
                        fill
                        className="object-cover"
                        sizes="44px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {result.type === "movie" ? (
                          <Film className="h-5 w-5 text-neutral-300" />
                        ) : (
                          <Tv className="h-5 w-5 text-neutral-300" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium text-black">
                      {result.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-600">
                        {result.type === "movie" ? "Movie" : "TV"}
                      </span>
                      {result.year && (
                        <span className="text-xs text-neutral-500">
                          {result.year}
                        </span>
                      )}
                      {result.voteAverage != null && result.voteAverage > 0 && (
                        <span className="flex items-center gap-1 text-xs text-neutral-500">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          {result.voteAverage.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

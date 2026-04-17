"use client";

import Image from "next/image";
import { Check, Film, Tv } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { StateMessage } from "@canto/ui/state-message";
import type { MediaSearchItem } from "../_lib/import-types";

interface ImportMediaResultsProps {
  isLoading: boolean;
  hasQuery: boolean;
  results: MediaSearchItem[];
  selectedMedia: MediaSearchItem | null;
  onSelect: (item: MediaSearchItem) => void;
}

export function ImportMediaResults({
  isLoading,
  hasQuery,
  results,
  selectedMedia,
  onSelect,
}: ImportMediaResultsProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!hasQuery || results.length === 0) {
    return <StateMessage preset="emptySearch" inline />;
  }
  return (
    <div className="space-y-2">
      {results.map((result) => (
        <MediaResultRow
          key={`${result.provider}-${result.externalId}-${result.type}`}
          result={result}
          isSelected={
            selectedMedia?.externalId === result.externalId &&
            selectedMedia.type === result.type
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function MediaResultRow({
  result,
  isSelected,
  onSelect,
}: {
  result: MediaSearchItem;
  isSelected: boolean;
  onSelect: (item: MediaSearchItem) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border hover:bg-accent/40"
      }`}
    >
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {result.posterPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w342${result.posterPath}`}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {result.type === "movie" ? (
              <Film className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Tv className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {result.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {result.type === "movie" ? "Movie" : "Series"}
          {result.year ? ` · ${result.year}` : ""}
        </p>
      </div>
      {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
    </button>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { StateMessage } from "@canto/ui/state-message";
import { TorrentCard } from "./torrent-card";
import type { TorrentActions } from "../_hooks/use-torrent-actions";

type TorrentRow = Parameters<typeof TorrentCard>[0]["torrent"];

interface TorrentListProps {
  torrents: TorrentRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  actions: TorrentActions;
  onDelete: (id: string, title: string) => void;
}

export function TorrentList({
  torrents,
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  sentinelRef,
  actions,
  onDelete,
}: TorrentListProps): React.JSX.Element {
  if (isError) {
    return <StateMessage preset="error" onRetry={onRetry} />;
  }
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-5 rounded-2xl bg-muted/40 p-4"
          >
            <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (torrents.length === 0) {
    return <StateMessage preset="emptyTorrents" />;
  }
  return (
    <div className="space-y-3">
      {torrents.map((t) => (
        <TorrentCard
          key={t.id}
          torrent={t}
          onPause={actions.pause}
          onResume={actions.resume}
          onRetry={actions.retry}
          onForceResume={actions.forceResume}
          onForceRecheck={actions.forceRecheck}
          onForceReannounce={actions.forceReannounce}
          onCopyMagnet={actions.copyMagnet}
          onDelete={onDelete}
          pausePending={actions.pausePending}
          resumePending={actions.resumePending}
          retryPending={actions.retryPending}
          advancedPending={actions.advancedPending}
        />
      ))}

      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasNextPage && !isFetchingNextPage && torrents.length > 0 && (
        <StateMessage preset="endOfItems" inline />
      )}
    </div>
  );
}

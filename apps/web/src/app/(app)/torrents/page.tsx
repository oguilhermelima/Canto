"use client";

import { useState } from "react";
import { Skeleton } from "@canto/ui/skeleton";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { resolveState } from "~/lib/torrent-utils";
import { TorrentCard } from "./_components/torrent-card";
import { DeleteDialog, type DeleteTarget } from "./_components/delete-dialog";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "downloading", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
] as const;

export default function DownloadsPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  useDocumentTitle("Downloads");

  const utils = trpc.useUtils();
  const { data: torrents, isLoading, isError } = trpc.torrent.listLive.useQuery(
    undefined,
    { refetchInterval: 3000 },
  );

  const pauseMutation = trpc.torrent.pause.useMutation({
    onSuccess: () => void utils.torrent.listLive.invalidate(),
  });
  const resumeMutation = trpc.torrent.resume.useMutation({
    onSuccess: () => void utils.torrent.listLive.invalidate(),
  });
  const retryMutation = trpc.torrent.retry.useMutation({
    onSuccess: () => void utils.torrent.listLive.invalidate(),
  });
  const deleteMutation = trpc.torrent.delete.useMutation({
    onSuccess: () => {
      void utils.torrent.listLive.invalidate();
      setDeleteTarget(null);
    },
  });

  const filtered =
    statusFilter === "all"
      ? torrents
      : torrents?.filter((t) => {
          const r = resolveState(t.status, t.live?.state, t.live?.progress);
          if (statusFilter === "downloading") return !r.isDownloaded && !r.canResume;
          if (statusFilter === "completed") return r.isDownloaded;
          if (statusFilter === "paused") return r.canResume && !r.isDownloaded;
          return true;
        });

  const counts = {
    all: torrents?.length ?? 0,
    downloading: torrents?.filter((t) => {
      const r = resolveState(t.status, t.live?.state, t.live?.progress);
      return !r.isDownloaded && !r.canResume;
    }).length ?? 0,
    completed: torrents?.filter((t) => resolveState(t.status, t.live?.state, t.live?.progress).isDownloaded).length ?? 0,
    paused: torrents?.filter((t) => {
      const r = resolveState(t.status, t.live?.state, t.live?.progress);
      return r.canResume && !r.isDownloaded;
    }).length ?? 0,
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">This page is only available to administrators.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader title="Downloads" subtitle="Monitor and manage your active downloads." />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={STATUS_TABS.map(({ value, label }) => ({
            value,
            label,
            count: counts[value as keyof typeof counts],
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        {/* Content */}
        {isError ? (
          <StateMessage preset="error" onRetry={() => void utils.torrent.listLive.invalidate()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-5 rounded-2xl bg-muted/40 p-4">
                <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <StateMessage preset="emptyTorrents" />
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => (
              <TorrentCard
                key={t.id}
                torrent={t as Parameters<typeof TorrentCard>[0]["torrent"]}
                onPause={(id) => pauseMutation.mutate({ id })}
                onResume={(id) => resumeMutation.mutate({ id })}
                onRetry={(id) => retryMutation.mutate({ id })}
                onDelete={(id, title) => setDeleteTarget({ id, title })}
                pausePending={pauseMutation.isPending}
                resumePending={resumeMutation.isPending}
                retryPending={retryMutation.isPending}
              />
            ))}
            {filtered.length > 0 && <StateMessage preset="endOfItems" inline />}
          </div>
        )}

        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={(id, deleteFiles, removeTorrent) =>
            deleteMutation.mutate({ id, deleteFiles, removeTorrent })
          }
          isPending={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}

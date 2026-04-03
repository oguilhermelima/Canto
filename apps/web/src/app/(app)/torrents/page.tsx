"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Pause,
  Play,
  Trash2,
  ArrowDown,
  ArrowUp,
  Clock,
  HardDrive,
  RotateCcw,
  Film,
  Tv,
} from "lucide-react";
import { StateMessage } from "~/components/layout/state-message";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDownloadLabel,
  formatQualityLabel,
  resolveState,
} from "~/lib/torrent-utils";


const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "downloading", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
] as const;

/* ─── Page ─── */

export default function DownloadsPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteTorrent, setDeleteTorrent] = useState(true);

  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    document.title = "Downloads — Canto";
  }, []);

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
          {filtered.map((t) => {
            const resolved = resolveState(t.status, t.live?.state, t.live?.progress);
            const progress = t.live?.progress ?? t.progress ?? (resolved.isDownloaded ? 1 : 0);
            const progressPct = Math.round(progress * 100);
            const qualityLabel = formatQualityLabel(t.quality);
            const size = t.live?.size ?? t.fileSize ?? 0;

            const dlLabel = formatDownloadLabel(t.downloadType, t.seasonNumber, t.episodeNumbers);
            const mediaTitle = t.media?.title ?? "";
            const fileName = t.title;

            const progressColor = resolved.isDownloaded
              ? "bg-green-500"
              : resolved.canResume
                ? "bg-yellow-500"
                : "bg-blue-500";

            return (
              <div key={t.id} className="overflow-hidden rounded-2xl bg-muted/40">
                <div className="flex items-center gap-5 p-5 sm:p-6">
                  {/* Poster */}
                  <Link
                    href={t.media ? `/media/${t.media.id}` : "#"}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-24 sm:w-24"
                  >
                    {t.media?.posterPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w342${t.media.posterPath}`}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {t.media?.type === "show" ? <Tv size={26} className="text-muted-foreground/30" /> : <Film size={26} className="text-muted-foreground/30" />}
                      </div>
                    )}
                    {qualityLabel && (
                      <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none text-white backdrop-blur-sm">
                        {qualityLabel}
                      </span>
                    )}
                  </Link>

                  {/* Info + progress */}
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {/* Title + file name */}
                    <div>
                      <p className="truncate text-base font-semibold text-foreground sm:text-lg">
                        {mediaTitle || fileName}
                        {dlLabel && <span className="ml-2 text-sm font-normal text-muted-foreground">{dlLabel}</span>}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground/60">
                        {fileName}
                      </p>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {t.live && !resolved.isDownloaded ? (
                        <>
                          <span className="flex items-center gap-1.5">
                            <ArrowDown size={14} className="text-blue-400" />
                            {formatSpeed(t.live.dlspeed)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <ArrowUp size={14} className="text-green-400" />
                            {formatSpeed(t.live.upspeed)}
                          </span>
                          {t.live.eta > 0 && t.live.eta < 8640000 && (
                            <span className="flex items-center gap-1.5">
                              <Clock size={14} />
                              {formatEta(t.live.eta)}
                            </span>
                          )}
                          <span className="text-muted-foreground/50">
                            {t.live.seeds} seeds · {t.live.peers} peers
                          </span>
                        </>
                      ) : resolved.isDownloaded && resolved.seedingLabel ? (
                        <>
                          <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", resolved.seedingColor)}>
                            {resolved.seedingLabel}
                          </span>
                          {t.live && (
                            <span className="text-muted-foreground/50">
                              {t.live.seeds} seeds · {t.live.peers} peers
                              {t.live.ratio > 0 && ` · Ratio ${t.live.ratio.toFixed(2)}`}
                            </span>
                          )}
                        </>
                      ) : null}
                      {size > 0 && (
                        <span className="flex items-center gap-1.5">
                          <HardDrive size={14} className="text-muted-foreground/50" />
                          {formatBytes(size)}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", progressColor)}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                        {progressPct}%
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    {t.media && (
                      <Link
                        href={`/media/${t.media.id}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                        title="Info"
                      >
                        <Tv size={18} />
                      </Link>
                    )}
                    {resolved.canRetry && (
                      <button onClick={() => retryMutation.mutate({ id: t.id })} disabled={retryMutation.isPending} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-blue-500 disabled:opacity-40" title="Retry">
                        <RotateCcw size={18} />
                      </button>
                    )}
                    {resolved.canResume && (
                      <button onClick={() => resumeMutation.mutate({ id: t.id })} disabled={resumeMutation.isPending} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-green-500 disabled:opacity-40" title="Resume">
                        <Play size={18} />
                      </button>
                    )}
                    {resolved.canPause && (
                      <button onClick={() => pauseMutation.mutate({ id: t.id })} disabled={pauseMutation.isPending} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-yellow-500 disabled:opacity-40" title="Pause">
                        <Pause size={18} />
                      </button>
                    )}
                    <button onClick={() => setDeleteTarget({ id: t.id, title: t.media?.title ?? t.title })} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-red-500" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Mobile actions */}
                <div className="flex items-center justify-end gap-1.5 px-4 pb-4 sm:hidden">
                  {t.media && (
                    <Link href={`/media/${t.media.id}`} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground" title="Info">
                      <Tv size={16} />
                    </Link>
                  )}
                  {resolved.canRetry && (
                    <button onClick={() => retryMutation.mutate({ id: t.id })} disabled={retryMutation.isPending} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-blue-500 disabled:opacity-40" title="Retry"><RotateCcw size={16} /></button>
                  )}
                  {resolved.canResume && (
                    <button onClick={() => resumeMutation.mutate({ id: t.id })} disabled={resumeMutation.isPending} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-green-500 disabled:opacity-40" title="Resume"><Play size={16} /></button>
                  )}
                  {resolved.canPause && (
                    <button onClick={() => pauseMutation.mutate({ id: t.id })} disabled={pauseMutation.isPending} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-yellow-500 disabled:opacity-40" title="Pause"><Pause size={16} /></button>
                  )}
                  <button onClick={() => setDeleteTarget({ id: t.id, title: t.media?.title ?? t.title })} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
          {filtered && filtered.length > 0 && <StateMessage preset="endOfItems" inline />}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteFiles(false);
            setDeleteTorrent(true);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-border bg-background">
          <DialogHeader>
            <DialogTitle>Remove Download</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &quot;{deleteTarget?.title}&quot;?
              This will remove the record from Canto.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Delete files from disk</p>
                <p className="text-xs text-muted-foreground">
                  Remove imported files from the media library. Raw download files are not affected.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={deleteTorrent}
                onChange={(e) => setDeleteTorrent(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Remove from download client</p>
                <p className="text-xs text-muted-foreground">
                  Remove the torrent from qBittorrent. Stops seeding and frees the slot.
                </p>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({
                  id: deleteTarget.id,
                  deleteFiles,
                  removeTorrent: deleteTorrent,
                })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

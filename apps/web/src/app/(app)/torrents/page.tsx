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
  Download,
  Pause,
  Play,
  Trash2,
  HardDrive,
  ArrowDown,
  ArrowUp,
  Clock,
  RefreshCw,
  RotateCcw,
  Film,
  Tv,
  Users,
  Upload,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDownloadLabel,
  formatQualityLabel,
  sourceLabel,
  sourceColor,
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

  useEffect(() => {
    document.title = "Downloads — Canto";
  }, []);

  const utils = trpc.useUtils();
  const { data: torrents, isLoading } = trpc.torrent.listLive.useQuery(
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

  return (
    <div className="w-full">
      <PageHeader title="Downloads" />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header actions */}
      <div className="mb-6 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void utils.torrent.listLive.invalidate()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Status tabs */}
      <div className="mb-6">
        <TabBar
          tabs={STATUS_TABS.map(({ value, label }) => ({
            value,
            label,
            count: counts[value as keyof typeof counts],
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-6 rounded-2xl border border-border bg-card p-6">
              <Skeleton className="h-36 w-24 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Download className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
            <h2 className="mb-2 text-lg font-medium text-foreground">
              No downloads
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Downloads from media pages will appear here with real-time progress.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const resolved = resolveState(t.status, t.live?.state, t.live?.progress);
            const progress = t.live?.progress ?? t.progress ?? (resolved.isDownloaded ? 1 : 0);
            const progressPct = Math.round(progress * 100);
            const qualityLabel = formatQualityLabel(t.quality);
            const srcLabel = sourceLabel(t.source);
            const size = t.live?.size ?? t.fileSize ?? 0;

            const dlLabel = formatDownloadLabel(t.downloadType, t.seasonNumber, t.episodeNumbers);
            const mediaTitle = t.media?.title ?? "";
            const composedTitle = [mediaTitle, dlLabel, qualityLabel].filter(Boolean).join(" ");

            // "X days ago"
            const daysAgo = t.createdAt
              ? Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000)
              : null;
            const timeAgo = daysAgo != null
              ? daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`
              : null;

            return (
              <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {/* ── Row 1: Time ago + Media page link ── */}
                <div className="flex items-center justify-between px-5 pt-4">
                  <span className="text-sm text-muted-foreground/60">{timeAgo}</span>
                  {t.media && (
                    <Link
                      href={`/media/${t.media.id}`}
                      className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Media page
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>

                {/* ── Row 2: Poster + Info + Actions ── */}
                <div className="flex gap-4 px-4 py-4 sm:gap-6 sm:px-5">
                  {/* Poster — 2:3 ratio */}
                  <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-28">
                    {t.media?.posterPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w185${t.media.posterPath}`}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="112px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {t.media?.type === "show" ? <Tv size={20} className="text-muted-foreground/30" /> : <Film size={20} className="text-muted-foreground/30" />}
                      </div>
                    )}
                  </div>

                  {/* Info block */}
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {/* Title + badges */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                      <h3 className="min-w-0 text-sm font-semibold text-foreground sm:truncate sm:text-base">
                        {composedTitle || t.title}
                      </h3>
                      <span className={cn("shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:text-xs", resolved.color)}>
                        {resolved.label}
                      </span>
                      {resolved.seedingLabel && (
                        <span className={cn("shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:text-xs", resolved.seedingColor)}>
                          {resolved.seedingLabel}
                        </span>
                      )}
                    </div>

                    {/* Torrent name */}
                    <p className="flex items-center gap-2 truncate text-sm text-muted-foreground/70">
                      <Download size={14} className="shrink-0 text-muted-foreground/40" />
                      {t.title}
                    </p>

                    {/* Download path */}
                    {t.contentPath && resolved.isDownloaded && (
                      <p className="flex items-center gap-2 truncate text-sm text-muted-foreground/50">
                        <HardDrive size={14} className="shrink-0" />
                        {t.contentPath}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="hidden shrink-0 items-start gap-2 sm:flex">
                    {resolved.canRetry && (
                      <button onClick={() => retryMutation.mutate({ id: t.id })} disabled={retryMutation.isPending} className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-blue-500/15 hover:text-blue-500 disabled:opacity-40" title="Retry"><RotateCcw size={16} /></button>
                    )}
                    {resolved.canResume && (
                      <button onClick={() => resumeMutation.mutate({ id: t.id })} disabled={resumeMutation.isPending} className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-500 disabled:opacity-40" title="Resume"><Play size={16} /></button>
                    )}
                    {resolved.canPause && (
                      <button onClick={() => pauseMutation.mutate({ id: t.id })} disabled={pauseMutation.isPending} className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-yellow-500/15 hover:text-yellow-500 disabled:opacity-40" title="Pause"><Pause size={16} /></button>
                    )}
                    <button onClick={() => setDeleteTarget({ id: t.id, title: t.media?.title ?? t.title })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </div>

                {/* ── Mobile actions ── */}
                <div className="flex items-center justify-end gap-2 px-4 pb-3 sm:hidden">
                  {resolved.canRetry && (
                    <button onClick={() => retryMutation.mutate({ id: t.id })} disabled={retryMutation.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-blue-500/15 hover:text-blue-500 disabled:opacity-40" title="Retry"><RotateCcw size={14} /></button>
                  )}
                  {resolved.canResume && (
                    <button onClick={() => resumeMutation.mutate({ id: t.id })} disabled={resumeMutation.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-500 disabled:opacity-40" title="Resume"><Play size={14} /></button>
                  )}
                  {resolved.canPause && (
                    <button onClick={() => pauseMutation.mutate({ id: t.id })} disabled={pauseMutation.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-yellow-500/15 hover:text-yellow-500 disabled:opacity-40" title="Pause"><Pause size={14} /></button>
                  )}
                  <button onClick={() => setDeleteTarget({ id: t.id, title: t.media?.title ?? t.title })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                </div>

                {/* ── Row 3: Stats bar ── */}
                <div className="flex items-center gap-5 border-t border-border px-5 py-3.5 text-sm text-muted-foreground">
                  {/* Progress */}
                  <div className="flex flex-1 items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", resolved.isDownloaded ? "bg-green-500" : resolved.canResume ? "bg-yellow-500" : "bg-blue-500")}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-medium tabular-nums">{progressPct}%</span>
                  </div>

                  {/* Divider */}
                  <span className="h-5 w-px bg-border" />

                  {/* Stats */}
                  {size > 0 && (
                    <span className="flex items-center gap-1.5">
                      <HardDrive size={14} className="text-muted-foreground/40" />
                      {formatBytes(size)}
                    </span>
                  )}
                  {t.live ? (
                    <>
                      <span className="flex items-center gap-1.5 text-blue-400">
                        <ArrowDown size={14} />
                        {formatSpeed(t.live.dlspeed)}
                      </span>
                      <span className="flex items-center gap-1.5 text-green-400">
                        <ArrowUp size={14} />
                        {formatSpeed(t.live.upspeed)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users size={14} className="text-muted-foreground/40" />
                        {t.live.seeds} seeds · {t.live.peers} peers
                      </span>
                    </>
                  ) : resolved.canRetry ? (
                    <span className="text-muted-foreground/40">Removed from client</span>
                  ) : null}
                </div>
              </div>
            );
          })}
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

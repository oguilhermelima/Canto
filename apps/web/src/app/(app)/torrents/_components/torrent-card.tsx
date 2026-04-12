"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
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
import { mediaDetailHref } from "~/lib/media-href";
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDownloadLabel,
  formatQualityLabel,
  resolveState,
} from "~/lib/torrent-utils";

interface TorrentCardProps {
  torrent: {
    id: string;
    title: string;
    status: string;
    quality: string | null;
    progress: number | null;
    fileSize: number | null;
    downloadType: string | null;
    seasonNumber: number | null;
    episodeNumbers: number[] | null;
    media: {
      type: string;
      externalId: number;
      title: string;
      posterPath: string | null;
    } | null;
    live: {
      state: string;
      progress: number;
      dlspeed: number;
      upspeed: number;
      eta: number;
      seeds: number;
      peers: number;
      size: number;
      ratio: number;
    } | null;
  };
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  pausePending: boolean;
  resumePending: boolean;
  retryPending: boolean;
}

export function TorrentCard({
  torrent: t,
  onPause,
  onResume,
  onRetry,
  onDelete,
  pausePending,
  resumePending,
  retryPending,
}: TorrentCardProps): React.JSX.Element {
  const resolved = resolveState(t.status, t.live?.state, t.live?.progress);
  const progress = t.live?.progress ?? t.progress ?? (resolved.isDownloaded ? 1 : 0);
  const progressPct = Math.round(progress * 100);
  const qualityLabel = t.quality ? formatQualityLabel(t.quality) : null;
  const size = t.live?.size ?? t.fileSize ?? 0;

  const dlLabel = t.downloadType ? formatDownloadLabel(t.downloadType, t.seasonNumber, t.episodeNumbers) : null;
  const mediaTitle = t.media?.title ?? "";
  const fileName = t.title;

  const progressColor = resolved.isDownloaded
    ? "bg-green-500"
    : resolved.canResume
      ? "bg-yellow-500"
      : "bg-blue-500";

  return (
    <div className="overflow-hidden rounded-2xl bg-muted/40">
      <div className="flex items-center gap-5 p-5 sm:p-6">
        {/* Poster */}
        <Link
          href={t.media ? mediaDetailHref(t.media) : "#"}
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
              {t.media?.type === "show" ? <Tv size={26} className="text-muted-foreground" /> : <Film size={26} className="text-muted-foreground" />}
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
          <div>
            <p className="truncate text-base font-semibold text-foreground sm:text-lg">
              {mediaTitle || fileName}
              {dlLabel && <span className="ml-2 text-sm font-normal text-muted-foreground">{dlLabel}</span>}
            </p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
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
                <span className="text-muted-foreground">
                  {t.live.seeds} seeds · {t.live.peers} peers
                </span>
              </>
            ) : resolved.isDownloaded && resolved.seedingLabel ? (
              <>
                <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", resolved.seedingColor)}>
                  {resolved.seedingLabel}
                </span>
                {t.live && (
                  <span className="text-muted-foreground">
                    {t.live.seeds} seeds · {t.live.peers} peers
                    {t.live.ratio > 0 && ` · Ratio ${t.live.ratio.toFixed(2)}`}
                  </span>
                )}
              </>
            ) : null}
            {size > 0 && (
              <span className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-muted-foreground" />
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

        {/* Desktop actions */}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {t.media && (
            <Link
              href={mediaDetailHref(t.media)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              title="Info"
            >
              <Tv size={18} />
            </Link>
          )}
          {resolved.canRetry && (
            <button onClick={() => onRetry(t.id)} disabled={retryPending} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-blue-500 disabled:opacity-40" title="Retry">
              <RotateCcw size={18} />
            </button>
          )}
          {resolved.canResume && (
            <button onClick={() => onResume(t.id)} disabled={resumePending} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-green-500 disabled:opacity-40" title="Resume">
              <Play size={18} />
            </button>
          )}
          {resolved.canPause && (
            <button onClick={() => onPause(t.id)} disabled={pausePending} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-yellow-500 disabled:opacity-40" title="Pause">
              <Pause size={18} />
            </button>
          )}
          <button onClick={() => onDelete(t.id, t.media?.title ?? t.title)} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-red-500" title="Delete">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Mobile actions */}
      <div className="flex items-center justify-end gap-1.5 px-4 pb-4 sm:hidden">
        {t.media && (
          <Link href={mediaDetailHref(t.media)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground" title="Info">
            <Tv size={16} />
          </Link>
        )}
        {resolved.canRetry && (
          <button onClick={() => onRetry(t.id)} disabled={retryPending} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-blue-500 disabled:opacity-40" title="Retry"><RotateCcw size={16} /></button>
        )}
        {resolved.canResume && (
          <button onClick={() => onResume(t.id)} disabled={resumePending} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-green-500 disabled:opacity-40" title="Resume"><Play size={16} /></button>
        )}
        {resolved.canPause && (
          <button onClick={() => onPause(t.id)} disabled={pausePending} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-yellow-500 disabled:opacity-40" title="Pause"><Pause size={16} /></button>
        )}
        <button onClick={() => onDelete(t.id, t.media?.title ?? t.title)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { DropdownMenuItem } from "@canto/ui/dropdown-menu";
import {
  Pause,
  Play,
  Trash2,
  HardDrive,
  RotateCcw,
  Film,
  Tv,
  MoreHorizontal,
  RefreshCw,
  Radio,
  Copy,
  Rocket,
} from "lucide-react";
import { mediaDetailHref } from "@/lib/media-href";
import { ResponsiveMenu } from "@/components/layout/responsive-menu";
import {
  formatBytes,
  formatDownloadLabel,
  formatQualityLabel,
  resolveState,
} from "@/lib/torrent-utils";

interface TorrentCardProps {
  torrent: {
    id: string;
    hash: string | null;
    title: string;
    status: string;
    quality: string | null;
    progress: number | null;
    fileSize: number | null;
    magnetUrl: string | null;
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
  onForceResume: (id: string) => void;
  onForceRecheck: (id: string) => void;
  onForceReannounce: (id: string) => void;
  onCopyMagnet: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  pausePending: boolean;
  resumePending: boolean;
  retryPending: boolean;
  advancedPending: boolean;
}

export function TorrentCard({
  torrent: t,
  onPause,
  onResume,
  onRetry,
  onForceResume,
  onForceRecheck,
  onForceReannounce,
  onCopyMagnet,
  onDelete,
  pausePending,
  resumePending,
  retryPending,
  advancedPending,
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
    <div className="rounded-2xl bg-muted/40 p-4 sm:p-5">
      <div className="flex items-start gap-4 sm:gap-5">
        <Link
          href={t.media ? mediaDetailHref(t.media) : "#"}
          className="relative h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-muted/70 sm:h-28 sm:w-20"
        >
          {t.media?.posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w342${t.media.posterPath}`}
              alt=""
              fill
              className="object-contain"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {t.media?.type === "show" ? <Tv size={24} className="text-muted-foreground" /> : <Film size={24} className="text-muted-foreground" />}
            </div>
          )}
          {qualityLabel && (
            <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none text-white backdrop-blur-sm">
              {qualityLabel}
            </span>
          )}
        </Link>

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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            {resolved.seedingLabel ? (
              <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", resolved.seedingColor)}>
                {resolved.seedingLabel}
              </span>
            ) : (
              <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", resolved.color)}>
                {resolved.label}
              </span>
            )}
            {t.live ? <span>{t.live.seeds} seeds</span> : null}
            {t.live ? <span>{t.live.peers} peers</span> : null}
            {t.live && t.live.ratio > 0 ? <span>Ratio {t.live.ratio.toFixed(2)}</span> : null}
            {size > 0 ? (
              <span className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-muted-foreground" />
                {formatBytes(size)}
              </span>
            ) : null}
          </div>

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
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-2">
          {resolved.canPause ? (
            <button
              onClick={() => onPause(t.id)}
              disabled={pausePending}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-accent px-3 text-sm font-medium transition-colors hover:bg-accent/80 disabled:opacity-40"
              title="Pause"
            >
              <Pause size={15} />
              Pause
            </button>
          ) : resolved.canResume ? (
            <button
              onClick={() => onResume(t.id)}
              disabled={resumePending}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-accent px-3 text-sm font-medium transition-colors hover:bg-accent/80 disabled:opacity-40"
              title="Resume"
            >
              <Play size={15} />
              Resume
            </button>
          ) : resolved.canRetry ? (
            <button
              onClick={() => onRetry(t.id)}
              disabled={retryPending}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-accent px-3 text-sm font-medium transition-colors hover:bg-accent/80 disabled:opacity-40"
              title="Retry"
            >
              <RotateCcw size={15} />
              Retry
            </button>
          ) : null}

          <button
            onClick={() => onDelete(t.id, t.media?.title ?? t.title)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-accent px-3 text-sm font-medium text-red-400 transition-colors hover:bg-accent/80"
            title="Delete"
          >
            <Trash2 size={15} />
            Remove
          </button>
        </div>

        <ResponsiveMenu
          trigger={(
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-accent text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
              title="Torrent actions"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
          desktopContentClassName="w-56"
          sheetTitle="Torrent actions"
          desktopContent={(
            <>
              <DropdownMenuItem
                onClick={() => onForceResume(t.id)}
                disabled={!t.hash || advancedPending}
                className="gap-3 px-3 py-2.5 text-sm font-medium"
              >
                <Rocket className="h-4 w-4" />
                Force Resume
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onForceRecheck(t.id)}
                disabled={!t.hash || advancedPending}
                className="gap-3 px-3 py-2.5 text-sm font-medium"
              >
                <RefreshCw className="h-4 w-4" />
                Force Recheck
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onForceReannounce(t.id)}
                disabled={!t.hash || advancedPending}
                className="gap-3 px-3 py-2.5 text-sm font-medium"
              >
                <Radio className="h-4 w-4" />
                Force Reannounce
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onCopyMagnet(t.id)}
                disabled={!t.magnetUrl && !t.hash}
                className="gap-3 px-3 py-2.5 text-sm font-medium"
              >
                <Copy className="h-4 w-4" />
                Copy magnetic link
              </DropdownMenuItem>
            </>
          )}
          mobileContent={({ close }) => (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  onForceResume(t.id);
                  close();
                }}
                disabled={!t.hash || advancedPending}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                <Rocket className="h-4 w-4 shrink-0" />
                Force Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  onForceRecheck(t.id);
                  close();
                }}
                disabled={!t.hash || advancedPending}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4 shrink-0" />
                Force Recheck
              </button>
              <button
                type="button"
                onClick={() => {
                  onForceReannounce(t.id);
                  close();
                }}
                disabled={!t.hash || advancedPending}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                <Radio className="h-4 w-4 shrink-0" />
                Force Reannounce
              </button>
              <button
                type="button"
                onClick={() => {
                  onCopyMagnet(t.id);
                  close();
                }}
                disabled={!t.magnetUrl && !t.hash}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                <Copy className="h-4 w-4 shrink-0" />
                Copy magnetic link
              </button>
            </div>
          )}
        />
      </div>
    </div>
  );
}

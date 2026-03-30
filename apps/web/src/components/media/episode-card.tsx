import Image from "next/image";
import { cn } from "@canto/ui/cn";
import { Check, Star, CheckCircle2, Download } from "lucide-react";

export interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  overview?: string | null;
  stillPath?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  voteAverage?: number | null;
}

export interface EpisodeDownloadInfo {
  quality: string;
  source: string;
  status: string;
}

export function EpisodeCard({
  episode,
  seasonNumber,
  isSelected,
  isMuted,
  onToggle,
  selectable,
  downloadInfo,
  serverAvailability,
}: {
  episode: Episode;
  seasonNumber: number;
  isSelected: boolean;
  isMuted: boolean;
  onToggle: () => void;
  selectable: boolean;
  downloadInfo?: EpisodeDownloadInfo;
  serverAvailability?: Array<{ type: string; resolution?: string | null }>;
}): React.JSX.Element {
  const num = String(episode.episodeNumber).padStart(2, "0");
  const isFuture =
    !!episode.airDate && new Date(episode.airDate) > new Date();
  const isInteractive = selectable && !isFuture;

  return (
    <div
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onToggle : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl transition-all",
        isFuture && "pointer-events-none opacity-40",
        isInteractive && "cursor-pointer",
        !isFuture && isSelected && !isMuted
          ? "ring-2 ring-primary"
          : !isFuture && !isMuted && "hover:ring-1 hover:ring-border",
        !isFuture && isMuted && "opacity-40",
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {episode.stillPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w400${episode.stillPath}`}
            alt={episode.title || `Episode ${episode.episodeNumber}`}
            fill
            className={cn(
              "object-cover transition-transform duration-300",
              !isMuted && "group-hover:scale-105",
            )}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-2xl font-black text-muted-foreground/8">
              E{num}
            </span>
          </div>
        )}

        <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white backdrop-blur-sm">
          E{num}
        </div>

        {episode.runtime != null && episode.runtime > 0 && (
          <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white/70 backdrop-blur-sm">
            {episode.runtime}m
          </div>
        )}

        {/* Availability indicators */}
        {!isSelected && !isMuted && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
            {downloadInfo?.status === "imported" && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/90 text-white shadow-sm backdrop-blur-sm" title="Downloaded">
                <CheckCircle2 size={14} />
              </div>
            )}
            {(downloadInfo?.status === "pending" || downloadInfo?.status === "downloading") && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/90 text-white shadow-sm backdrop-blur-sm" title={downloadInfo.status === "downloading" ? "Downloading" : "Pending"}>
                <Download size={14} />
              </div>
            )}
            {serverAvailability?.some((s) => s.type === "jellyfin") && (
              <div className="flex h-5 items-center gap-0.5 rounded-full bg-[#00a4dc]/90 px-1.5 text-[9px] font-bold text-white shadow-sm backdrop-blur-sm" title="Available on Jellyfin">
                JF
              </div>
            )}
            {serverAvailability?.some((s) => s.type === "plex") && (
              <div className="flex h-5 items-center gap-0.5 rounded-full bg-[#e5a00d]/90 px-1.5 text-[9px] font-bold text-black shadow-sm backdrop-blur-sm" title="Available on Plex">
                PX
              </div>
            )}
          </div>
        )}

        {/* Hover selection indicator */}
        {isInteractive && !isSelected && !isMuted && !downloadInfo && !serverAvailability?.length && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/30 bg-black/30 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100" />
        )}

        {/* Selected overlay */}
        {!isFuture && isSelected && !isMuted && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/25">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Check size={18} strokeWidth={3} />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="line-clamp-1 text-sm font-semibold leading-snug">
          {episode.title || `Episode ${episode.episodeNumber}`}
        </p>
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {episode.voteAverage != null && episode.voteAverage > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-500">
              <Star size={10} className="fill-current" />
              {episode.voteAverage.toFixed(1)}
            </span>
          )}
          {episode.airDate && (
            <span>
              {new Date(episode.airDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>
        {episode.overview && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/60">
            {episode.overview}
          </p>
        )}
      </div>
    </div>
  );
}

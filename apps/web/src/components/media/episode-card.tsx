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

  const hasJellyfin = serverAvailability?.some((s) => s.type === "jellyfin");
  const hasPlex = serverAvailability?.some((s) => s.type === "plex");

  return (
    <div
      className={cn(
        "group flex items-center gap-4 py-4 pr-3 pl-3 transition-colors sm:pr-4 sm:pl-4",
        isFuture && "pointer-events-none opacity-40",
        !isFuture && !isMuted && "hover:bg-muted/40",
        !isFuture && isMuted && "opacity-40",
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-[88px] sm:w-40">
        {episode.stillPath ? (
          <Image
            src={episode.stillPath.startsWith("http") ? episode.stillPath : `https://image.tmdb.org/t/p/w300${episode.stillPath}`}
            alt={episode.title || `Episode ${episode.episodeNumber}`}
            fill
            className="object-cover"
            sizes="160px"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-xl font-black text-muted-foreground/10">
              E{num}
            </span>
          </div>
        )}

        {/* Rating badge — top left */}
        {episode.voteAverage != null && episode.voteAverage > 0 && (
          <div className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-yellow-500 backdrop-blur-sm">
            <Star size={10} className="fill-current" />
            {episode.voteAverage.toFixed(1)}
          </div>
        )}

        {/* Runtime badge — bottom right */}
        {episode.runtime != null && episode.runtime > 0 && (
          <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white/80 backdrop-blur-sm">
            {episode.runtime}m
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">E{num}</span>
          <span className="text-muted-foreground/30">·</span>
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
        <p className="mt-1 line-clamp-1 text-sm font-bold leading-snug sm:text-base">
          {episode.title || `Episode ${episode.episodeNumber}`}
        </p>
        {episode.overview && (
          <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {episode.overview}
          </p>
        )}
      </div>

      {/* Right side — badges + checkbox */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Download status */}
        {downloadInfo?.status === "imported" && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/90 text-white" title="Downloaded">
            <CheckCircle2 size={12} />
          </div>
        )}
        {(downloadInfo?.status === "pending" || downloadInfo?.status === "downloading") && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/90 text-white" title={downloadInfo.status === "downloading" ? "Downloading" : "Pending"}>
            <Download size={12} />
          </div>
        )}

        {/* Jellyfin badge */}
        {hasJellyfin && (
          <div className="flex items-center gap-1.5 rounded-xl border border-[#a95ce0]/20 bg-gradient-to-r from-[#a95ce0]/10 to-[#4bb8e8]/10 p-1.5 sm:px-2.5 sm:py-1" title="Available on Jellyfin">
            <span
              className="inline-block h-4 w-4 shrink-0"
              style={{
                background: "linear-gradient(135deg, #a95ce0, #4bb8e8)",
                mask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat",
              }}
            />
            <span className="hidden bg-gradient-to-r from-[#a95ce0] to-[#4bb8e8] bg-clip-text text-xs font-medium text-transparent sm:inline">
              Available
            </span>
          </div>
        )}

        {/* Plex badge */}
        {hasPlex && (
          <div className="flex items-center gap-1.5 rounded-xl border border-[#e5a00d]/20 bg-[#e5a00d]/10 p-1.5 sm:px-2.5 sm:py-1" title="Available on Plex">
            <span
              className="inline-block h-4 w-4 shrink-0 bg-[#e5a00d]"
              style={{
                mask: "url(/plex-logo.svg) center/contain no-repeat",
                WebkitMask: "url(/plex-logo.svg) center/contain no-repeat",
              }}
            />
            <span className="hidden text-xs font-medium text-[#e5a00d] sm:inline">
              Available
            </span>
          </div>
        )}

        {/* Select checkbox */}
        {isInteractive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex shrink-0 items-center justify-center"
          >
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all",
                isSelected && !isMuted
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 hover:border-muted-foreground/50",
              )}
            >
              {isSelected && !isMuted && <Check size={13} strokeWidth={3} />}
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

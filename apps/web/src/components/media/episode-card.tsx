import Link from "next/link";
import { FadeImage } from "~/components/ui/fade-image";
import { cn } from "@canto/ui/cn";
import { Star, CheckCircle2, Download } from "lucide-react";

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
  showExternalId,
  downloadInfo,
  serverAvailability,
}: {
  episode: Episode;
  seasonNumber: number;
  showExternalId: string;
  downloadInfo?: EpisodeDownloadInfo;
  serverAvailability?: Array<{ type: string; resolution?: string | null }>;
}): React.JSX.Element {
  const num = String(episode.episodeNumber).padStart(2, "0");
  const isFuture =
    !!episode.airDate && new Date(episode.airDate) > new Date();

  const hasJellyfin = serverAvailability?.some((s) => s.type === "jellyfin");
  const hasPlex = serverAvailability?.some((s) => s.type === "plex");

  const href = `/shows/${showExternalId}/season/${seasonNumber}/episode/${episode.episodeNumber}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex w-[260px] shrink-0 flex-col overflow-hidden rounded-xl bg-background/50 transition-colors sm:w-[280px]",
        isFuture && "pointer-events-none opacity-40",
        !isFuture && "hover:bg-muted/40",
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        {episode.stillPath ? (
          <FadeImage
            src={episode.stillPath.startsWith("http") ? episode.stillPath : `https://image.tmdb.org/t/p/w400${episode.stillPath}`}
            alt={episode.title || `Episode ${episode.episodeNumber}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            fadeDuration={300}
            sizes="280px"
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

        {/* Status badges — top right */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
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
          {hasJellyfin && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#a95ce0]/20 bg-black/60 backdrop-blur-sm" title="Jellyfin">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0"
                style={{
                  background: "linear-gradient(135deg, #a95ce0, #4bb8e8)",
                  mask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                  WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                }}
              />
            </div>
          )}
          {hasPlex && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#e5a00d]/20 bg-black/60 backdrop-blur-sm" title="Plex">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 bg-[#e5a00d]"
                style={{
                  mask: "url(/plex-logo.svg) center/contain no-repeat",
                  WebkitMask: "url(/plex-logo.svg) center/contain no-repeat",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-2 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">E{num}</span>
          {episode.airDate && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>
                {new Date(episode.airDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          )}
        </div>
        <p className="mt-1 line-clamp-1 text-sm font-bold leading-snug">
          {episode.title || `Episode ${episode.episodeNumber}`}
        </p>
        {episode.overview && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {episode.overview}
          </p>
        )}
      </div>
    </Link>
  );
}

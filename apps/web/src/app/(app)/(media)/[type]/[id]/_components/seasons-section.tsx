"use client";

import { useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { SeasonTabs } from "~/components/media/season-tabs";

interface SeasonsSectionProps {
  media: {
    id: string;
    type: string;
    externalId: number | null;
    seasons?: any[];
    libraryId: string | null;
    libraryPath: string | null;
    continuousDownload: boolean | null;
  };
  isAdmin: boolean;
  availability: { data?: { episodes?: any } };
  mediaServers: { data?: any };
  allLibraries: { id: string; name: string }[] | undefined;
  openTorrentDialog: (context?: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  }) => void;
  setMediaLibrary: {
    mutate: (input: { mediaId: string; libraryId: string | null }) => void;
  };
  setContinuousDownload: {
    mutate: (input: { mediaId: string; enabled: boolean }) => void;
  };
  setTorrentSearchQuery: (q: string) => void;
  setTorrentSearchContext: (ctx: { seasonNumber?: number; episodeNumbers?: number[] } | null) => void;
  setTorrentPage: (p: number) => void;
  setTorrentDialogOpen: (open: boolean) => void;
  torrentDialogOpen: boolean;
  seasonsHighlight: boolean;
  mediaType: "movie" | "show";
}

export function SeasonsSection({
  media,
  isAdmin,
  availability,
  mediaServers,
  allLibraries,
  openTorrentDialog,
  setMediaLibrary,
  setContinuousDownload,
  setTorrentSearchQuery,
  setTorrentSearchContext,
  setTorrentPage,
  setTorrentDialogOpen,
  torrentDialogOpen,
  seasonsHighlight,
  mediaType,
}: SeasonsSectionProps): React.JSX.Element | null {
  const router = useRouter();

  if (media.type !== "show" || !media.seasons) return null;

  return (
    <div
      id="seasons-section"
      className={cn(
        "scroll-mt-20 rounded-2xl transition-colors duration-700",
        seasonsHighlight && "bg-foreground/5",
      )}
    >
      <SeasonTabs
        seasons={media.seasons.map((s: any) => ({
          id: s.id,
          seasonNumber: s.number,
          name: s.name ?? `Season ${s.number}`,
          overview: s.overview,
          episodeCount: s.episodeCount,
          airDate: s.airDate,
          posterPath: s.posterPath,
          episodes: s.episodes?.map((e: any) => ({
            id: e.id,
            episodeNumber: e.number,
            title: e.title ?? `Episode ${e.number}`,
            overview: e.overview,
            stillPath: e.stillPath,
            airDate: e.airDate,
            runtime: e.runtime,
            voteAverage: e.voteAverage,
          })),
        }))}
        onDownloadSeasons={
          isAdmin
            ? (seasonNumbers) => {
                if (seasonNumbers.length > 0) {
                  openTorrentDialog({ seasonNumber: seasonNumbers[0]! });
                }
              }
            : undefined
        }
        onDownloadEpisodes={
          isAdmin
            ? (seasonNumber, episodeNumbers) => {
                openTorrentDialog({ seasonNumber, episodeNumbers });
              }
            : undefined
        }
        hideFloatingBar={torrentDialogOpen}
        mediaConfig={
          isAdmin
            ? {
                libraryId: media.libraryId ?? null,
                libraryPath: media.libraryPath ?? null,
                continuousDownload: media.continuousDownload ?? false,
                libraries: (allLibraries ?? []).map((l) => ({
                  id: l.id,
                  name: l.name,
                })),
                onLibraryChange: (libraryId) => {
                  setMediaLibrary.mutate({ mediaId: media.id, libraryId });
                },
                onContinuousDownloadChange: (enabled) => {
                  setContinuousDownload.mutate({
                    mediaId: media.id,
                    enabled,
                  });
                },
                onCustomSearch: (query: string) => {
                  setTorrentSearchQuery(query);
                  setTorrentSearchContext(null);
                  setTorrentPage(0);
                  setTorrentDialogOpen(true);
                },
              }
            : undefined
        }
        onOpenPreferences={
          isAdmin
            ? () =>
                router.push(
                  `/${mediaType === "show" ? "shows" : "movies"}/${media.externalId}/manage`,
                )
            : undefined
        }
        episodeAvailability={availability.data?.episodes}
        serverLinks={mediaServers.data}
      />
    </div>
  );
}

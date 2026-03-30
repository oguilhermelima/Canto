"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@canto/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Download,
  Play,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Search,
  ExternalLink,
  Library,
  Plus,
  Check,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import {
  MediaDetailHero,
  MediaDetailHeroSkeleton,
} from "~/components/media/media-detail-hero";
import { SeasonTabs } from "~/components/media/season-tabs";
import { CastSection } from "~/components/media/cast-section";
import { SimilarSection } from "~/components/media/similar-section";
import { WhereToWatch } from "~/components/media/where-to-watch";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDirectSearch } from "~/hooks/use-direct-search";

/* ─── Helpers ─── */

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatAge(days: number): string {
  if (days <= 0) return "new";
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function qualityBadge(
  quality: string,
): { label: string; className: string } | null {
  switch (quality) {
    case "uhd":
      return {
        label: "4K",
        className: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      };
    case "fullhd":
      return {
        label: "1080p",
        className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      };
    case "hd":
      return {
        label: "720p",
        className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
      };
    case "sd":
      return {
        label: "SD",
        className: "bg-slate-500/20 text-slate-300 border-slate-500/30",
      };
    default:
      return null;
  }
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    remux: "Remux",
    bluray: "Blu-Ray",
    webdl: "WEB-DL",
    webrip: "WEBRip",
    hdtv: "HDTV",
    telesync: "TS",
    cam: "CAM",
    unknown: "",
  };
  return map[source] ?? source;
}

function sourceBadge(
  source: string,
): { label: string; className: string } | null {
  const label = sourceLabel(source);
  if (!label) return null;
  switch (source) {
    case "remux":
    case "bluray":
      return {
        label,
        className: "bg-purple-500/15 text-purple-400 border-purple-500/20",
      };
    case "webdl":
    case "webrip":
      return {
        label,
        className: "bg-blue-500/15 text-blue-400 border-blue-500/20",
      };
    case "hdtv":
      return {
        label,
        className: "bg-teal-500/15 text-teal-400 border-teal-500/20",
      };
    case "telesync":
    case "cam":
      return {
        label,
        className: "bg-red-500/15 text-red-400 border-red-500/20",
      };
    default:
      return null;
  }
}

/* ─── Page ─── */

interface MediaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MediaDetailPage({
  params,
}: MediaDetailPageProps): React.JSX.Element {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [torrentDialogOpen, setTorrentDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false);
  const [removeDeleteTorrent, setRemoveDeleteTorrent] = useState(true);
  const [torrentSearchQuery, setTorrentSearchQuery] = useState("");
  const [torrentPage, setTorrentPage] = useState(0);
  const [torrentQualityFilter, setTorrentQualityFilter] = useState<string>("all");
  const [torrentSourceFilter, setTorrentSourceFilter] = useState<string>("all");
  const [torrentSizeFilter, setTorrentSizeFilter] = useState<string>("all");
  const [torrentSort, setTorrentSort] = useState<"seeders" | "peers" | "size" | "age" | "confidence">("confidence");
  const [torrentSortDir, setTorrentSortDir] = useState<"asc" | "desc">("desc");
  const TORRENTS_PER_PAGE = 20;

  const [torrentSearchContext, setTorrentSearchContext] = useState<{
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null>(null);

  const { region: watchRegion } = useWatchRegion();
  const { enabled: directSearchEnabled } = useDirectSearch();

  const provider = searchParams.get("provider");
  const externalId = searchParams.get("externalId");
  const type = searchParams.get("type");
  const isExternal = id === "ext" && provider && externalId && type;

  const mediaById = trpc.media.getById.useQuery(
    { id },
    { enabled: !isExternal },
  );
  const mediaByExternal = trpc.media.getByExternal.useQuery(
    {
      provider: (provider ?? "tmdb") as "tmdb" | "anilist" | "tvdb",
      externalId: parseInt(externalId ?? "0", 10),
      type: (type ?? "movie") as "movie" | "show",
    },
    { enabled: !!isExternal },
  );

  const media = isExternal ? mediaByExternal.data : mediaById.data;
  const mediaLoading = isExternal
    ? mediaByExternal.isLoading
    : mediaById.isLoading;

  useEffect(() => {
    if (media?.title) {
      document.title = `${media.title} — Canto`;
    }
  }, [media?.title]);

  const extras = trpc.media.getExtras.useQuery(
    { id: media?.id ?? "" },
    { enabled: !!media?.id },
  );

  const availability = trpc.sync.mediaAvailability.useQuery(
    { mediaId: media?.id ?? "" },
    { enabled: !!media?.id, staleTime: Infinity },
  );

  const mediaServers = trpc.sync.mediaServers.useQuery(
    { mediaId: media?.id ?? "" },
    { enabled: !!media?.id, staleTime: Infinity },
  );

  const watchProviderLinks = trpc.provider.watchProviderLinks.useQuery(
    undefined,
    { staleTime: Infinity, enabled: directSearchEnabled },
  );

  const isMovieInLibrary = media?.type === "movie" && media?.inLibrary === true;
  const mediaTorrentsQuery = trpc.torrent.listByMedia.useQuery(
    { mediaId: media?.id ?? "" },
    { enabled: !!media?.id && isMovieInLibrary },
  );
  const mediaTorrents = mediaTorrentsQuery.data;

  const torrentSearch = trpc.torrent.search.useQuery(
    {
      mediaId: media?.id ?? "",
      seasonNumber: torrentSearchContext?.seasonNumber,
      episodeNumbers: torrentSearchContext?.episodeNumbers,
    },
    { enabled: torrentDialogOpen && !!media?.id, retry: 1 },
  );

  const [lastDownloadAttempt, setLastDownloadAttempt] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const replaceTorrent = trpc.torrent.replace.useMutation({
    onSuccess: () => {
      toast.success("Replacement download started");
      setTorrentDialogOpen(false);
      setLastDownloadAttempt(null);
    },
    onError: (error) => {
      toast.error(`Replace failed: ${error.message}`);
    },
  });

  const downloadTorrent = trpc.torrent.download.useMutation({
    onSuccess: () => {
      toast.success("Download started");
      setTorrentDialogOpen(false);
      setLastDownloadAttempt(null);
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        toast.error(error.message, {
          action: {
            label: "Replace",
            onClick: () => {
              if (!lastDownloadAttempt || !media?.id) return;
              const isMagnet = lastDownloadAttempt.url.startsWith("magnet:");
              replaceTorrent.mutate({
                replaceFileIds: [],
                mediaId: media.id,
                ...(isMagnet
                  ? { magnetUrl: lastDownloadAttempt.url }
                  : { torrentUrl: lastDownloadAttempt.url }),
                title: lastDownloadAttempt.title,
                seasonNumber: torrentSearchContext?.seasonNumber,
                episodeNumbers: torrentSearchContext?.episodeNumbers ?? undefined,
              });
            },
          },
          duration: 10000,
        });
      } else {
        toast.error(`Download failed: ${error.message}`);
      }
    },
  });

  const addToLibrary = trpc.media.addToLibrary.useMutation();
  const removeFromLibrary = trpc.media.removeFromLibrary.useMutation();
  const deleteTorrentMutation = trpc.torrent.delete.useMutation();
  const utils = trpc.useUtils();

  // Library config queries
  const { data: allLibraries } = trpc.library.listLibraries.useQuery();
  const setContinuousDownload = trpc.library.setContinuousDownload.useMutation({
    onSuccess: () => {
      void utils.media.getById.invalidate({ id: media?.id });
      void utils.media.getByExternal.invalidate();
    },
  });
  const setMediaLibrary = trpc.library.setMediaLibrary.useMutation({
    onSuccess: () => {
      void utils.media.getById.invalidate({ id });
      void utils.media.getByExternal.invalidate();
      toast.success("Library updated");
    },
    onError: (error) => {
      toast.error(`Failed to update library: ${error.message}`);
    },
  });

  const handleLibraryToggle = (): void => {
    if (!media) return;
    const wasInLibrary = media.inLibrary;
    const mutation = wasInLibrary ? removeFromLibrary : addToLibrary;
    mutation.mutate(
      { id: media.id },
      {
        onSuccess: () => {
          void utils.media.getById.invalidate({ id: media.id });
          void utils.media.getByExternal.invalidate();
          void utils.library.list.invalidate();
          void utils.library.stats.invalidate();
          toast.success(
            wasInLibrary
              ? `Removed "${media.title}" from library`
              : `Added "${media.title}" to library`,
          );
          // Redirect to canonical URL when adding from /media/ext
          if (!wasInLibrary && isExternal) {
            router.replace(`/media/${media.id}`);
          }
        },
      },
    );
  };

  const handleDownload = (url: string, title: string): void => {
    if (!media?.id) return;
    setLastDownloadAttempt({ url, title });
    const isMagnet = url.startsWith("magnet:");
    downloadTorrent.mutate({
      mediaId: media.id,
      ...(isMagnet ? { magnetUrl: url } : { torrentUrl: url }),
      title,
      seasonNumber: torrentSearchContext?.seasonNumber,
      episodeNumbers: torrentSearchContext?.episodeNumbers ?? undefined,
    });
  };

  const openTorrentDialog = (context?: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  }): void => {
    setTorrentSearchContext(context ?? null);
    setTorrentSearchQuery("");
    setTorrentPage(0);
    setTorrentQualityFilter("all");
    setTorrentSourceFilter("all");
    setTorrentSizeFilter("all");
    setTorrentSort("confidence");
    setTorrentSortDir("desc");
    setTorrentDialogOpen(true);
  };

  // Whether the torrent dialog was opened from a season selection (no search/filter UI)
  const isSeasonPreselected =
    torrentSearchContext?.seasonNumber !== undefined;

  if (mediaLoading) return <MediaDetailPageSkeleton />;

  if (!media) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Media not found
          </h2>
          <p className="text-muted-foreground">
            The media you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  const credits = (extras.data?.credits?.cast ?? []).map((c) => ({
    id: String(c.id),
    name: c.name,
    character: c.character,
    profilePath: c.profilePath,
    order: c.order,
  }));

  const similar = (extras.data?.similar ?? []).map((s) => ({
    externalId: String(s.externalId),
    provider: s.provider,
    type: s.type as "movie" | "show",
    title: s.title,
    posterPath: s.posterPath ?? null,
    year: s.year,
    voteAverage: s.voteAverage,
  }));

  const recommendations = (extras.data?.recommendations ?? []).map((r) => ({
    externalId: String(r.externalId),
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  const videos = (extras.data?.videos ?? []).slice().sort((a, b) => {
    const priority = (videoType: string | undefined): number => {
      if (videoType === "Trailer") return 0;
      if (videoType === "Teaser") return 1;
      return 2;
    };
    return priority(a.type) - priority(b.type);
  });

  const watchProvidersByRegion = extras.data?.watchProviders ?? {};
  const regionData = watchProvidersByRegion[watchRegion];
  const tmdbType = media?.type === "show" ? "tv" : "movie";
  const watchLink = regionData?.link
    ?? (media?.externalId ? `https://www.themoviedb.org/${tmdbType}/${media.externalId}/watch?locale=${watchRegion}` : undefined);
  const providerLinks = watchProviderLinks.data ?? {};
  const dedup = (
    providers: typeof regionData extends undefined ? never : NonNullable<typeof regionData>["flatrate"],
  ): NonNullable<typeof providers> => {
    const seen = new Set<string>();
    return (providers ?? []).filter((p) => {
      const key = providerLinks[p.providerId] ?? `__id:${p.providerId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const flatrateProviders = dedup(regionData?.flatrate);
  const rentBuyProviders = dedup([
    ...(regionData?.rent ?? []),
    ...(regionData?.buy ?? []),
  ]).filter(
    (p) =>
      !flatrateProviders.some(
        (f) => f.providerId === p.providerId || f.logoPath === p.logoPath,
      ),
  );

  // Filter + sort torrent results
  const allFilteredTorrents = (torrentSearch.data ?? [])
    .filter((t) => {
      // Text filter
      if (torrentSearchQuery.trim()) {
        if (!t.title.toLowerCase().includes(torrentSearchQuery.toLowerCase()))
          return false;
      }
      // Quality filter
      if (torrentQualityFilter !== "all" && t.quality !== torrentQualityFilter)
        return false;
      // Source filter
      if (torrentSourceFilter !== "all" && t.source !== torrentSourceFilter)
        return false;
      // Size filter
      if (torrentSizeFilter !== "all") {
        const gb = t.size / (1024 * 1024 * 1024);
        if (torrentSizeFilter === "small" && gb >= 2) return false;
        if (torrentSizeFilter === "medium" && (gb < 2 || gb >= 10)) return false;
        if (torrentSizeFilter === "large" && gb < 10) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = torrentSortDir === "desc" ? -1 : 1;
      if (torrentSort === "confidence") return (a.confidence - b.confidence) * dir;
      if (torrentSort === "seeders") return (a.seeders - b.seeders) * dir;
      if (torrentSort === "peers") return (a.leechers - b.leechers) * dir;
      if (torrentSort === "age") return (a.age - b.age) * dir;
      return (a.size - b.size) * dir;
    });
  const totalPages = Math.max(
    1,
    Math.ceil(allFilteredTorrents.length / TORRENTS_PER_PAGE),
  );
  const paginatedTorrents = allFilteredTorrents.slice(
    torrentPage * TORRENTS_PER_PAGE,
    (torrentPage + 1) * TORRENTS_PER_PAGE,
  );

  const toggleSort = (col: "seeders" | "peers" | "size" | "age" | "confidence"): void => {
    if (torrentSort === col) {
      setTorrentSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setTorrentSort(col);
      setTorrentSortDir("desc");
    }
    setTorrentPage(0);
  };

  const isLibraryPending =
    addToLibrary.isPending || removeFromLibrary.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <MediaDetailHero
        id={media.id}
        type={media.type as "movie" | "show"}
        title={media.title}
        tagline={media.tagline}
        overview={media.overview}
        backdropPath={media.backdropPath}
        posterPath={media.posterPath}
        year={media.year}
        releaseDate={media.releaseDate}
        voteAverage={media.voteAverage}
        voteCount={media.voteCount}
        genres={media.genres ?? undefined}
        runtime={media.runtime}
        status={media.status}
        logoPath={media.logoPath}
        externalId={media.externalId}
        provider={media.provider}
        inLibrary={media.inLibrary}
        onRemoveClick={media.inLibrary ? () => setRemoveDialogOpen(true) : undefined}
        availableSources={availability.data?.sources}
      />

      {/* Main content */}
      <div className="mx-auto flex w-full flex-1 flex-col gap-16 px-4 pb-2 pt-10 md:gap-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Where to Watch */}
        <WhereToWatch
          mediaId={media.id}
          mediaTitle={media.title}
          flatrateProviders={flatrateProviders}
          rentBuyProviders={rentBuyProviders}
          watchLink={watchLink}
          watchProviderLinks={watchProviderLinks.data ?? {}}
          servers={mediaServers.data}
        />

        {/* Seasons (TV Shows) */}
        {media.type === "show" && media.seasons && (
          <SeasonTabs
            seasons={media.seasons.map((s) => ({
              id: s.id,
              seasonNumber: s.number,
              name: s.name ?? `Season ${s.number}`,
              overview: s.overview,
              episodeCount: s.episodeCount,
              airDate: s.airDate,
              posterPath: s.posterPath,
              episodes: s.episodes?.map((e) => ({
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
            onDownloadSeasons={media.inLibrary ? (seasonNumbers) => {
              if (seasonNumbers.length > 0) {
                openTorrentDialog({ seasonNumber: seasonNumbers[0]! });
              }
            } : undefined}
            onDownloadEpisodes={media.inLibrary ? (seasonNumber, episodeNumbers) => {
              openTorrentDialog({ seasonNumber, episodeNumbers });
            } : undefined}
            hideFloatingBar={torrentDialogOpen}
            mediaConfig={media.inLibrary ? {
              libraryId: media.libraryId ?? null,
              libraryPath: media.libraryPath ?? null,
              continuousDownload: media.continuousDownload ?? false,
              libraries: (allLibraries ?? []).map((l) => ({ id: l.id, name: l.name })),
              onLibraryChange: (libraryId) => {
                setMediaLibrary.mutate({ mediaId: media.id, libraryId });
              },
              onContinuousDownloadChange: (enabled) => {
                setContinuousDownload.mutate({ mediaId: media.id, enabled });
              },
              onCustomSearch: (query: string) => {
                setTorrentSearchQuery(query);
                setTorrentSearchContext(null);
                setTorrentPage(0);
                setTorrentDialogOpen(true);
              },
            } : undefined}
            episodeAvailability={availability.data?.episodes}
            serverLinks={mediaServers.data}
          />
        )}

        {/* Download (Movies) */}
        {media.type === "movie" && media.inLibrary === true && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Download
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openTorrentDialog()}
                className="gap-2"
              >
                <Search className="h-4 w-4" />
                Search Torrent
              </Button>
            </div>
            {mediaTorrents && mediaTorrents.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {mediaTorrents.map((t) => {
                  const qb = qualityBadge(t.quality);
                  const sb = sourceBadge(t.source);
                  const statusMap: Record<string, { label: string; className: string }> = {
                    downloading: { label: "Downloading", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
                    paused: { label: "Paused", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
                    completed: { label: "Completed", className: "bg-green-500/15 text-green-400 border-green-500/20" },
                    finished: { label: "Completed", className: "bg-green-500/15 text-green-400 border-green-500/20" },
                    unknown: { label: "Unknown", className: "bg-muted text-muted-foreground border-border" },
                    incomplete: { label: "Incomplete", className: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
                  };
                  const resolvedStatus = t.imported
                    ? { label: "Imported", className: "bg-green-500/15 text-green-400 border-green-500/20" }
                    : t.progress >= 1
                      ? { label: "Downloaded", className: "bg-green-500/15 text-green-400 border-green-500/20" }
                      : (statusMap[t.status] ?? statusMap.unknown!);
                  return (
                    <div key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {t.title}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {qb && (
                          <Badge variant="outline" className={qb.className}>
                            {qb.label}
                          </Badge>
                        )}
                        {sb && (
                          <Badge variant="outline" className={sb.className}>
                            {sb.label}
                          </Badge>
                        )}
                        <Badge variant="outline" className={resolvedStatus.className}>
                          {resolvedStatus.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <Download className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No files downloaded yet. Use the search button to find torrents.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Cast */}
        <CastSection credits={credits} isLoading={extras.isLoading} />

      </div>

      {/* Full-width sections -- Videos, Recommendations, Similar */}
      <div className="mt-16 flex flex-col gap-16 pb-16 md:mt-20 md:gap-20">
        {/* Videos */}
        {videos.length > 0 && (
          <VideoCarousel videos={videos.slice(0, 8)} />
        )}

        <SimilarSection
          similar={similar}
          recommendations={recommendations}
          isLoading={extras.isLoading}
        />
      </div>


      {/* Remove from library dialog */}
      <Dialog
        open={removeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveDialogOpen(false);
            setRemoveDeleteFiles(false);
            setRemoveDeleteTorrent(true);
          }
        }}
      >
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold">
                Remove from Library
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                {media.title}
              </DialogDescription>
            </div>
            <button
              onClick={() => setRemoveDialogOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
            >
              <span className="text-lg leading-none text-foreground">×</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <p className="text-sm text-muted-foreground">
              This will remove the item from your library. Choose what else to clean up:
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={removeDeleteFiles}
                onChange={(e) => setRemoveDeleteFiles(e.target.checked)}
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
                checked={removeDeleteTorrent}
                onChange={(e) => setRemoveDeleteTorrent(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Remove from download client</p>
                <p className="text-xs text-muted-foreground">
                  Remove torrents from qBittorrent. Stops seeding and frees the slot.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              disabled={removeFromLibrary.isPending}
              onClick={async () => {
                if (!media) return;
                try {
                  // Delete associated torrents first if requested
                  if (removeDeleteTorrent || removeDeleteFiles) {
                    const torrents = await utils.torrent.listByMedia.fetch({ mediaId: media.id });
                    await Promise.all(
                      torrents.map((t) =>
                        deleteTorrentMutation.mutateAsync({
                          id: t.id,
                          deleteFiles: removeDeleteFiles,
                          removeTorrent: removeDeleteTorrent,
                        }).catch(() => {}),
                      ),
                    );
                  }
                  // Then remove from library
                  await removeFromLibrary.mutateAsync({ id: media.id });
                  void utils.media.getById.invalidate({ id: media.id });
                  void utils.media.getByExternal.invalidate();
                  void utils.library.list.invalidate();
                  void utils.torrent.listByMedia.invalidate();
                  setRemoveDialogOpen(false);
                  toast.success(`Removed "${media.title}" from library`);
                } catch {
                  toast.error("Failed to remove from library");
                }
              }}
            >
              {removeFromLibrary.isPending ? "Removing..." : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Torrent search dialog */}
      <Dialog open={torrentDialogOpen} onOpenChange={setTorrentDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-7xl gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
          {/* Custom header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold">
                {media.title}
                {isSeasonPreselected && (
                  <span className="text-muted-foreground">
                    {" "}
                    — Season {String(torrentSearchContext!.seasonNumber).padStart(2, "0")}
                    {torrentSearchContext!.episodeNumbers &&
                      torrentSearchContext!.episodeNumbers.length > 0 && (
                        <span>
                          {" "}
                          E
                          {torrentSearchContext!.episodeNumbers
                            .map((n) => String(n).padStart(2, "0"))
                            .join(", E")}
                        </span>
                      )}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Search torrents for {media.title}
              </DialogDescription>
            </div>
            <button
              onClick={() => setTorrentDialogOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
            >
              <span className="text-lg leading-none text-foreground">×</span>
            </button>
          </div>

          {/* Filter toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {/* Text filter */}
            <div className="relative min-w-[180px] flex-1">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Filter..."
                value={torrentSearchQuery}
                onChange={(e) => {
                  setTorrentSearchQuery(e.target.value);
                  setTorrentPage(0);
                }}
                className="h-9 pl-8 text-sm"
              />
            </div>

            {/* Quality filter */}
            <select
              value={torrentQualityFilter}
              onChange={(e) => {
                setTorrentQualityFilter(e.target.value);
                setTorrentPage(0);
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
            >
              <option value="all">All Quality</option>
              <option value="uhd">4K</option>
              <option value="fullhd">1080p</option>
              <option value="hd">720p</option>
              <option value="sd">SD</option>
            </select>

            {/* Source filter */}
            <select
              value={torrentSourceFilter}
              onChange={(e) => {
                setTorrentSourceFilter(e.target.value);
                setTorrentPage(0);
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
            >
              <option value="all">All Sources</option>
              <option value="remux">Remux</option>
              <option value="bluray">Blu-Ray</option>
              <option value="webdl">WEB-DL</option>
              <option value="webrip">WEBRip</option>
              <option value="hdtv">HDTV</option>
            </select>

            {/* Size filter */}
            <select
              value={torrentSizeFilter}
              onChange={(e) => {
                setTorrentSizeFilter(e.target.value);
                setTorrentPage(0);
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
            >
              <option value="all">All Sizes</option>
              <option value="small">&lt; 2 GB</option>
              <option value="medium">2–10 GB</option>
              <option value="large">&gt; 10 GB</option>
            </select>

            {/* Season pills — only when NOT pre-selected */}
            {!isSeasonPreselected && media.type === "show" && media.seasons && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex flex-wrap gap-1">
                  <button
                    className={`h-7 rounded-full px-2.5 text-xs font-medium transition-colors ${
                      torrentSearchContext?.seasonNumber === undefined
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      setTorrentSearchContext(null);
                      setTorrentSearchQuery("");
                      setTorrentPage(0);
                    }}
                  >
                    All
                  </button>
                  {media.seasons
                    .filter((s) => s.number > 0)
                    .sort((a, b) => a.number - b.number)
                    .map((season) => (
                      <button
                        key={season.number}
                        className={`h-7 rounded-full px-2.5 text-xs font-medium transition-colors ${
                          torrentSearchContext?.seasonNumber === season.number
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => {
                          setTorrentSearchContext({ seasonNumber: season.number });
                          setTorrentSearchQuery("");
                          setTorrentPage(0);
                        }}
                      >
                        S{season.number.toString().padStart(2, "0")}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>

          {/* Table results */}
          <div className="max-h-[60vh] overflow-y-scroll">
            {torrentSearch.isLoading ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 px-5 py-16">
                {/* Animated radar/search rings */}
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <div className="absolute h-20 w-20 animate-ping rounded-full border border-primary/20" style={{ animationDuration: "2s" }} />
                  <div className="absolute h-14 w-14 animate-ping rounded-full border border-primary/30" style={{ animationDuration: "2s", animationDelay: "0.4s" }} />
                  <div className="absolute h-8 w-8 animate-ping rounded-full border border-primary/40" style={{ animationDuration: "2s", animationDelay: "0.8s" }} />
                  <Search size={20} className="relative z-10 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Scanning indexers
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Searching across all connected sources...
                  </p>
                </div>
              </div>
            ) : torrentSearch.isError ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-destructive">
                  Search failed
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {torrentSearch.error?.message ?? "Could not reach indexer."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void torrentSearch.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : paginatedTorrents.length > 0 ? (
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-[96px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[72px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[60px]" />
                  <col className="w-[100px]" />
                  <col className="w-[52px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 border-b border-border bg-background">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Title</th>
                    <th
                      className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-foreground"
                      onClick={() => toggleSort("size")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Size
                        {torrentSort === "size" ? (
                          torrentSortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                    <th className="px-3 py-3 font-medium">Quality</th>
                    <th className="px-3 py-3 font-medium">Source</th>
                    <th
                      className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-foreground"
                      onClick={() => toggleSort("confidence")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Score
                        {torrentSort === "confidence" ? (
                          torrentSortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-foreground"
                      onClick={() => toggleSort("seeders")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Seeds
                        {torrentSort === "seeders" ? (
                          torrentSortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-foreground"
                      onClick={() => toggleSort("peers")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Peers
                        {torrentSort === "peers" ? (
                          torrentSortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-foreground"
                      onClick={() => toggleSort("age")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Age
                        {torrentSort === "age" ? (
                          torrentSortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                    <th className="px-3 py-3 font-medium">Indexer</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTorrents.map((t, i) => {
                    const url = t.magnetUrl ?? t.downloadUrl;
                    const badge = qualityBadge(t.quality);
                    const srcBdg = sourceBadge(t.source);
                    return (
                      <tr
                        key={`${t.guid}-${i}`}
                        className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
                      >
                        {/* Title */}
                        <td className="overflow-hidden px-5 py-3">
                          <p className="text-sm font-medium text-foreground">
                            {t.title}
                          </p>
                        </td>
                        {/* Size */}
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                          {t.size > 0 ? formatBytes(t.size) : "—"}
                        </td>
                        {/* Quality */}
                        <td className="px-3 py-3">
                          {badge ? (
                            <Badge
                              variant="outline"
                              className={`w-[56px] justify-center rounded-lg text-[10px] font-bold ${badge.className}`}
                            >
                              {badge.label}
                            </Badge>
                          ) : (
                            <span className="inline-flex w-[56px] justify-center text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        {/* Source */}
                        <td className="px-3 py-3">
                          {srcBdg ? (
                            <Badge
                              variant="outline"
                              className={`w-[60px] justify-center rounded-lg text-[10px] font-bold ${srcBdg.className}`}
                            >
                              {srcBdg.label}
                            </Badge>
                          ) : (
                            <span className="inline-flex w-[60px] justify-center text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        {/* Confidence */}
                        <td className="px-3 py-3 text-xs tabular-nums text-foreground">
                          <span className={
                            t.confidence >= 70 ? "text-green-400" :
                            t.confidence >= 40 ? "text-yellow-400" :
                            "text-muted-foreground"
                          }>
                            {t.confidence}
                          </span>
                        </td>
                        {/* Seeders */}
                        <td className="px-3 py-3 text-xs tabular-nums text-green-500">
                          {t.seeders ?? 0}
                        </td>
                        {/* Leechers */}
                        <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                          {t.leechers ?? 0}
                        </td>
                        {/* Age */}
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatAge(t.age)}
                        </td>
                        {/* Indexer */}
                        <td className="overflow-hidden px-3 py-3 text-xs text-muted-foreground/60">
                          <span className="block truncate">{t.indexer ?? "—"}</span>
                        </td>
                        {/* Download */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => url && handleDownload(url, t.title)}
                            disabled={!url || downloadTorrent.isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40"
                          >
                            <Download size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  No results found
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Check your indexer configuration in Prowlarr.
                </p>
              </div>
            )}
          </div>

          {/* Pagination footer */}
          {allFilteredTorrents.length > TORRENTS_PER_PAGE && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                {allFilteredTorrents.length} result
                {allFilteredTorrents.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={torrentPage === 0}
                  onClick={() => setTorrentPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={torrentPage + 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= totalPages) {
                        setTorrentPage(val - 1);
                      }
                    }}
                    className="h-7 w-10 rounded-md border border-border bg-background text-center text-xs tabular-nums text-foreground outline-none focus:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span>/ {totalPages}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={torrentPage >= totalPages - 1}
                  onClick={() => setTorrentPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaDetailPageSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <MediaDetailHeroSkeleton />
      <div className="mx-auto flex w-full flex-col gap-12 px-4 pt-10 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <section>
          <Skeleton className="mb-4 h-7 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="mb-4 h-7 w-48" />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="aspect-square w-full rounded-full" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Video Carousel ─── */

interface Video {
  id?: string;
  key: string;
  name?: string;
  type?: string;
}

function VideoCarousel({ videos }: { videos: Video[] }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  const scroll = useCallback(
    (dir: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollBy({
        left: dir === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8,
        behavior: "smooth",
      });
      setTimeout(updateScroll, 350);
    },
    [updateScroll],
  );

  return (
    <section className="relative">
      <h2 className="mb-4 pl-4 text-xl font-semibold text-foreground md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        Videos
      </h2>
      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("left")}
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {canScrollRight && (
          <button
            className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("right")}
          >
            <ChevronRight size={28} />
          </button>
        )}
        <div
          ref={scrollRef}
          onScroll={updateScroll}
          className="flex gap-4 overflow-x-auto pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {videos.map((video) => (
            <a
              key={video.id ?? video.key}
              href={`https://www.youtube.com/watch?v=${video.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-video w-[300px] shrink-0 overflow-hidden rounded-xl bg-muted sm:w-[340px] lg:w-[380px]"
            >
              <img
                src={`https://img.youtube.com/vi/${video.key}/hqdefault.jpg`}
                alt={video.name ?? "Video"}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
                <Play className="h-10 w-10 text-white" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-3">
                <p className="line-clamp-1 text-sm font-medium text-white">
                  {video.name}
                </p>
                {video.type && (
                  <span className="mt-1 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
                    {video.type}
                  </span>
                )}
              </div>
            </a>
          ))}
          {/* End spacer */}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}

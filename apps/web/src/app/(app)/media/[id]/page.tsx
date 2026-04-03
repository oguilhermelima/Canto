"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
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
  ArrowUpDown,
  Settings2,
  RefreshCw,
  Loader2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  HardDrive,
  Clock,
  Monitor,
  Film as FilmIcon,
  Zap,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
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
import { PreferencesModal } from "~/components/media/manage/preferences-modal";

import {
  formatBytes,
  formatAge,
  formatQualityLabel,
  sourceLabel,
} from "~/lib/torrent-utils";

/* ─── Page ─── */

interface MediaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MediaDetailPage({
  params,
}: MediaDetailPageProps): React.JSX.Element {
  const { id } = use(params);
  // Key forces full remount when navigating between media pages,
  // preventing stale state (search results, filters, dialogs) from persisting
  return <MediaDetailContent key={id} id={id} />;
}

function MediaDetailContent({ id }: { id: string }): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [torrentDialogOpen, setTorrentDialogOpen] = useState(false);
  const [seasonsHighlight, setSeasonsHighlight] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false);
  const [removeDeleteTorrent, setRemoveDeleteTorrent] = useState(true);
  const [torrentSearchQuery, setTorrentSearchQuery] = useState("");
  const [torrentPage, setTorrentPage] = useState(0);
  const [torrentQualityFilter, setTorrentQualityFilter] = useState<string>("all");
  const [torrentSourceFilter, setTorrentSourceFilter] = useState<string>("all");
  const [torrentSizeFilter, setTorrentSizeFilter] = useState<string>("all");
  const [torrentSort, setTorrentSort] = useState<"seeders" | "peers" | "size" | "age" | "confidence">("confidence");
  const [torrentSortDir, setTorrentSortDir] = useState<"asc" | "desc">("desc");
  const TORRENTS_PER_PAGE = 30;

  const [torrentSearchContext, setTorrentSearchContext] = useState<{
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null>(null);
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [advancedQuery, setAdvancedQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const { region: watchRegion } = useWatchRegion();
  const { enabled: directSearchEnabled } = useDirectSearch();

  const provider = searchParams.get("provider");
  const externalId = searchParams.get("externalId");
  const type = searchParams.get("type");
  const isExternal = id === "ext" && provider && externalId && type;

  const mediaById = trpc.media.getById.useQuery(
    { id },
    {
      enabled: !isExternal,
      refetchInterval: (query) => {
        const d = query.state.data as { processingStatus?: string } | undefined;
        return d?.processingStatus && d.processingStatus !== "ready" ? 5000 : false;
      },
    },
  );
  const mediaByExternal = trpc.media.getByExternal.useQuery(
    {
      provider: (provider ?? "tmdb") as "tmdb" | "anilist" | "tvdb",
      externalId: parseInt(externalId ?? "0", 10),
      type: (type ?? "movie") as "movie" | "show",
    },
    {
      enabled: !!isExternal,
      refetchInterval: (query) => {
        const d = query.state.data as { processingStatus?: string } | undefined;
        return d?.processingStatus && d.processingStatus !== "ready" ? 5000 : false;
      },
    },
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
    { enabled: !!media?.id, staleTime: 30 * 60 * 1000 },
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

  const isMovieInLibrary = media?.type === "movie" && !!media?.libraryId;
  const mediaTorrentsQuery = trpc.torrent.listByMedia.useQuery(
    { mediaId: media?.id ?? "" },
    { enabled: !!media?.id && isMovieInLibrary },
  );
  const mediaTorrents = mediaTorrentsQuery.data;

  const torrentSearch = trpc.torrent.search.useQuery(
    {
      mediaId: media?.id ?? "",
      query: advancedSearch && committedQuery ? committedQuery : undefined,
      seasonNumber: advancedSearch ? undefined : torrentSearchContext?.seasonNumber,
      episodeNumbers: advancedSearch ? undefined : torrentSearchContext?.episodeNumbers,
      page: torrentPage,
      pageSize: TORRENTS_PER_PAGE,
    },
    {
      enabled: torrentDialogOpen && !!media?.id && (!advancedSearch || committedQuery.length > 0),
      retry: 1,
      staleTime: 0,
    },
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

  const deleteTorrentMutation = trpc.torrent.delete.useMutation();
  const replaceProvider = trpc.media.replaceProvider.useMutation();
  const utils = trpc.useUtils();
  const requestDownload = trpc.request.create.useMutation({
    onSuccess: () => {
      toast.success("Download requested");
      void utils.request.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const cancelRequest = trpc.request.cancel.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled");
      void utils.request.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const existingRequest = trpc.request.list.useQuery(undefined, {
    select: (data) => data.find((r) => r.mediaId === media?.id),
    enabled: !isAdmin && !!media?.id,
  });

  // Library config queries
  const { data: allLibraries } = trpc.library.listLibraries.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });
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
  const hasMore = torrentSearch.data?.hasMore ?? false;
  const allFilteredTorrents = (torrentSearch.data?.results ?? [])
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
  // Don't show stale results when advanced search is active but no query committed yet
  const paginatedTorrents = (advancedSearch && !committedQuery) ? [] : allFilteredTorrents;

  const toggleSort = (col: "seeders" | "peers" | "size" | "age" | "confidence"): void => {
    if (torrentSort === col) {
      setTorrentSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setTorrentSort(col);
      setTorrentSortDir("desc");
    }
    setTorrentPage(0);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile logo */}
      <div className="relative z-10 flex h-16 items-center px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/room.png" alt="Canto" className="h-9 w-9 dark:invert" />
          <span className="text-lg font-bold tracking-tight text-foreground">Canto</span>
        </Link>
      </div>

      {/* Hero */}
      <MediaDetailHero
        id={media.id}
        type={media.type as "movie" | "show"}
        title={media.title}
        overview={media.overview}
        backdropPath={media.backdropPath}
        posterPath={media.posterPath}
        year={media.year}
        releaseDate={media.releaseDate}
        genres={media.genres ?? undefined}
        runtime={media.runtime}
        contentRating={media.contentRating}
        logoPath={media.logoPath}
        provider={media.provider}
        isAdmin={isAdmin}
        servers={mediaServers.data}
        flatrateProviders={flatrateProviders}
        rentBuyProviders={rentBuyProviders}
        watchLink={watchLink}
        watchProviderLinks={watchProviderLinks.data ?? {}}
        videos={videos}
        crew={extras.data?.credits?.crew?.map((c) => ({
          personId: c.id,
          name: c.name,
          job: c.job,
        }))}
      >
        {/* All sections below hero info — unified spacing */}
        <div className="flex flex-col gap-12 pb-16 md:gap-16">

          {/* Admin: Download & Manage */}
          {isAdmin && media.id && (
            <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
              <div className="flex-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  {media.downloaded ? "Download & Manage" : "Download"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {media.downloaded
                    ? "Download another version or manage library settings."
                    : "Search for torrents to download this content."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {media.processingStatus && media.processingStatus !== "ready" && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="hidden sm:inline">Refreshing metadata</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (media.type === "show") {
                      const el = document.getElementById("seasons-section");
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                        setSeasonsHighlight(true);
                        setTimeout(() => setSeasonsHighlight(false), 2000);
                      }
                    } else {
                      openTorrentDialog();
                    }
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground text-background px-4 text-sm font-medium transition-colors hover:bg-foreground/90"
                >
                  <Download className="h-4 w-4" />
                  {media.downloaded ? "Download Variant" : "Download"}
                </button>
                {media.downloaded && (
                <Link
                  href={`/media/${media.id}/manage`}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground/15 px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/25"
                >
                  <Settings2 className="h-4 w-4" />
                  Manage
                </Link>
                )}
              </div>
            </section>
          )}

          {/* Request Download — non-admin users (above videos) */}
          {!isAdmin && media.id && !media.downloaded && (() => {
          if (existingRequest.isLoading) {
            return (
              <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
                <div className="flex-1">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="mt-2 h-4 w-72" />
                </div>
                <Skeleton className="h-10 w-[120px] rounded-xl" />
              </section>
            );
          }
          const existing = existingRequest.data;
          if (existing) {
            const isPending = existing.status === "pending";
            const isApproved = existing.status === "approved";
            const isRejected = existing.status === "rejected";
            return (
              <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold tracking-tight">Want to watch this?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isPending && "Your request is pending admin approval."}
                    {isApproved && "Approved — waiting for admin to download."}
                    {isRejected && (existing.adminNote ?? "Your request was rejected.")}
                  </p>
                </div>
                {isPending && (
                  <div className="group/req relative">
                    <button
                      type="button"
                      onClick={() => cancelRequest.mutate({ id: existing.id })}
                      disabled={cancelRequest.isPending}
                      className="inline-flex h-10 w-[120px] items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all bg-green-500/20 text-green-500 hover:bg-red-500/20 hover:text-red-500"
                    >
                      <Check className="h-4 w-4 group-hover/req:hidden" />
                      <X className="hidden h-4 w-4 group-hover/req:block" />
                      <span className="group-hover/req:hidden">Requested</span>
                      <span className="hidden group-hover/req:inline">Cancel</span>
                    </button>
                  </div>
                )}
                {isApproved && (
                  <span className="inline-flex h-10 w-[120px] items-center justify-center gap-2 rounded-xl bg-blue-500/15 text-sm font-medium text-blue-500">
                    <Check className="h-4 w-4" />
                    Approved
                  </span>
                )}
                {isRejected && (
                  <span className="inline-flex h-10 w-[120px] items-center justify-center gap-2 rounded-xl bg-red-500/15 text-sm font-medium text-red-500">
                    <X className="h-4 w-4" />
                    Rejected
                  </span>
                )}
              </section>
            );
          }
          return (
            <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
              <div className="flex-1">
                <h2 className="text-lg font-semibold tracking-tight">Want to watch this?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Request the admin to download this content for you.
                </p>
              </div>
              <Button
                className="w-[120px] rounded-xl"
                onClick={() => requestDownload.mutate({ mediaId: media.id })}
                disabled={requestDownload.isPending}
              >
                {requestDownload.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Request
              </Button>
            </section>
          );
        })()}

          {/* Videos — show skeletons while loading, fade in when ready */}
          {extras.isLoading ? (
            <VideoCarouselSkeleton />
          ) : videos.length > 0 ? (
            <div className="animate-in fade-in-0 duration-500">
              <VideoCarousel videos={videos.slice(0, 8)} />
            </div>
          ) : null}

          <div className="flex flex-col gap-12 px-4 md:gap-16 md:px-8 lg:px-12 xl:px-16 2xl:px-24">

        {/* Seasons (TV Shows) */}
        {media.type === "show" && media.seasons && (
          <div
            id="seasons-section"
            className={cn(
              "scroll-mt-20 rounded-2xl transition-colors duration-700",
              seasonsHighlight && "bg-foreground/5",
            )}
          >
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
            onDownloadSeasons={isAdmin ? (seasonNumbers) => {
              if (seasonNumbers.length > 0) {
                openTorrentDialog({ seasonNumber: seasonNumbers[0]! });
              }
            } : undefined}
            onDownloadEpisodes={isAdmin ? (seasonNumber, episodeNumbers) => {
              openTorrentDialog({ seasonNumber, episodeNumbers });
            } : undefined}
            hideFloatingBar={torrentDialogOpen}
            mediaConfig={isAdmin ? {
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
            onOpenPreferences={isAdmin ? () => router.push(`/media/${media.id}/manage`) : undefined}
            episodeAvailability={availability.data?.episodes}
            serverLinks={mediaServers.data}
          />
          </div>
        )}

        {/* Cast */}
        <CastSection credits={credits} isLoading={extras.isLoading} />

          </div>

          {/* Full-width sections -- Recommendations, Similar */}
          <SimilarSection
            similar={similar}
            recommendations={recommendations}
            isLoading={extras.isLoading}
          />
        </div>
      </MediaDetailHero>

      {/* Preferences modal */}
      {media.libraryId && (
        <PreferencesModal
          open={preferencesOpen}
          onOpenChange={setPreferencesOpen}
          mediaId={media.id}
          mediaType={media.type as "movie" | "show"}
          mediaTitle={media.title}
          currentLibraryId={media.libraryId ?? null}
          continuousDownload={media.continuousDownload ?? false}
        />
      )}

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
                  Permanently delete all downloaded and imported files from disk.
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
              disabled={setMediaLibrary.isPending || deleteTorrentMutation.isPending}
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
                  // Then remove from library by clearing libraryId
                  await setMediaLibrary.mutateAsync({ mediaId: media.id, libraryId: null });
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
              {setMediaLibrary.isPending ? "Removing..." : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Torrent search dialog */}
      <Dialog open={torrentDialogOpen} onOpenChange={(open) => {
        setTorrentDialogOpen(open);
        if (!open) {
          setTorrentSearchContext(null);
          setTorrentSearchQuery("");
          setTorrentPage(0);
          setTorrentQualityFilter("all");
          setTorrentSourceFilter("all");
          setTorrentSizeFilter("all");
          setTorrentSort("confidence");
          setTorrentSortDir("desc");
          setLastDownloadAttempt(null);
          setAdvancedSearch(false);
          setAdvancedQuery("");
          setCommittedQuery("");
        }
      }}>
        <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-auto md:max-h-[70vh] md:max-w-5xl md:rounded-[2rem] [&>button:last-child]:hidden">
          {/* Header — single row on desktop, title + toggle + close */}
          <div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3 md:px-6">
            {/* Title / Input */}
            <div className="relative min-w-0 flex-1" style={{ height: "1.75rem" }}>
              <DialogTitle className={cn(
                "absolute inset-0 flex items-center truncate text-lg font-semibold tracking-tight transition-all duration-300",
                advancedSearch ? "pointer-events-none translate-y-1 opacity-0" : "translate-y-0 opacity-100",
              )}>
                {media.title}
                {isSeasonPreselected && (
                  <span className="text-muted-foreground">
                    {" "}— S{String(torrentSearchContext!.seasonNumber).padStart(2, "0")}
                    {torrentSearchContext!.episodeNumbers &&
                      torrentSearchContext!.episodeNumbers.length > 0 && (
                        <span>
                          E{torrentSearchContext!.episodeNumbers.map((n) => String(n).padStart(2, "0")).join(", E")}
                        </span>
                      )}
                  </span>
                )}
              </DialogTitle>
              <div className={cn(
                "absolute inset-0 flex items-center border-b transition-all duration-300",
                advancedSearch ? "border-foreground/20 opacity-100 delay-150" : "pointer-events-none border-transparent opacity-0",
              )}>
                <input
                  ref={(el) => { if (el && advancedSearch) el.focus(); }}
                  value={advancedQuery}
                  onChange={(e) => setAdvancedQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); setCommittedQuery(advancedQuery.trim()); setTorrentPage(0); }
                    if (e.key === "Escape") { setAdvancedSearch(false); setAdvancedQuery(""); setCommittedQuery(""); setTorrentPage(0); }
                  }}
                  className="w-full bg-transparent text-lg font-semibold tracking-tight text-foreground caret-primary outline-none"
                />
              </div>
              <DialogDescription className="sr-only">
                Search torrents for {media.title}
              </DialogDescription>
            </div>

            {/* Search button — advanced only */}
            {advancedSearch && (
              <button
                onClick={() => { setCommittedQuery(advancedQuery.trim()); setTorrentPage(0); }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-80"
              >
                <Search size={14} />
              </button>
            )}

            {/* Advanced toggle — hidden on mobile, shown in toolbar instead */}
            <label className="hidden shrink-0 cursor-pointer items-center gap-2 md:flex">
              <span className="text-xs text-muted-foreground">Advanced Search</span>
              <button
                role="switch"
                aria-checked={advancedSearch}
                onClick={() => {
                  if (advancedSearch) {
                    setAdvancedSearch(false);
                    setAdvancedQuery("");
                    setCommittedQuery("");
                    setTorrentPage(0);
                  } else {
                    setAdvancedSearch(true);
                    setAdvancedQuery(media.title);
                    setCommittedQuery("");
                  }
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                  advancedSearch ? "bg-primary" : "bg-muted",
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                  advancedSearch ? "translate-x-[18px]" : "translate-x-[3px]",
                )} />
              </button>
            </label>

            {/* Close */}
            <button
              onClick={() => setTorrentDialogOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Filter toolbar */}
          <div className="shrink-0 border-b border-border px-5 pb-4 md:px-6">
            {/* Mobile: unified filter shape */}
            <div className="overflow-hidden rounded-2xl bg-muted/40 md:hidden">
              {/* Header row: Filters toggle + Advanced toggle */}
              <div className="flex items-center">
                <button
                  onClick={() => setMobileFiltersOpen((o) => !o)}
                  className="flex flex-1 items-center gap-2 px-4 py-3 text-xs font-medium text-foreground/70"
                >
                  <SlidersHorizontal size={14} />
                  Filters & Sort
                  <ChevronDown size={12} className={cn("ml-auto transition-transform duration-300", mobileFiltersOpen && "rotate-180")} />
                </button>
                <div className="mr-3 h-5 w-px bg-border/30" />
                <label className="mr-3 flex cursor-pointer items-center gap-2">
                  <span className="text-xs text-foreground/70">Advanced Search</span>
                  <button
                    role="switch"
                    aria-checked={advancedSearch}
                    onClick={() => {
                      if (advancedSearch) { setAdvancedSearch(false); setAdvancedQuery(""); setCommittedQuery(""); setTorrentPage(0); }
                      else { setAdvancedSearch(true); setAdvancedQuery(media.title); setCommittedQuery(""); }
                    }}
                    className={cn("relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors", advancedSearch ? "bg-primary" : "bg-muted-foreground/30")}
                  >
                    <span className={cn("inline-block h-3 w-3 rounded-full bg-background shadow-sm transition-transform", advancedSearch ? "translate-x-[14px]" : "translate-x-[2px]")} />
                  </button>
                </label>
              </div>

              {/* Expandable panel — same container */}
              <div className={cn(
                "grid transition-all duration-300 ease-out",
                mobileFiltersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}>
                <div className="overflow-hidden">
                  <div className="space-y-3 border-t border-border/30 px-4 pt-3 pb-4">
                    {/* Search */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Filter results..."
                        value={torrentSearchQuery}
                        onChange={(e) => { setTorrentSearchQuery(e.target.value); setTorrentPage(0); }}
                        className="h-10 w-full rounded-xl bg-background pl-9 text-sm border-0 focus-visible:ring-1"
                      />
                    </div>
                    {/* Selects */}
                    <div className="grid grid-cols-3 gap-2">
                      <select value={torrentQualityFilter} onChange={(e) => { setTorrentQualityFilter(e.target.value); setTorrentPage(0); }} className="h-9 rounded-xl bg-background px-3 text-xs text-foreground outline-none">
                        <option value="all">Quality</option><option value="uhd">4K</option><option value="fullhd">1080p</option><option value="hd">720p</option><option value="sd">SD</option>
                      </select>
                      <select value={torrentSourceFilter} onChange={(e) => { setTorrentSourceFilter(e.target.value); setTorrentPage(0); }} className="h-9 rounded-xl bg-background px-3 text-xs text-foreground outline-none">
                        <option value="all">Source</option><option value="remux">Remux</option><option value="bluray">Blu-Ray</option><option value="webdl">WEB-DL</option><option value="webrip">WEBRip</option><option value="hdtv">HDTV</option>
                      </select>
                      <select value={torrentSizeFilter} onChange={(e) => { setTorrentSizeFilter(e.target.value); setTorrentPage(0); }} className="h-9 rounded-xl bg-background px-3 text-xs text-foreground outline-none">
                        <option value="all">Size</option><option value="small">&lt; 2 GB</option><option value="medium">2–10 GB</option><option value="large">&gt; 10 GB</option>
                      </select>
                    </div>
                    {/* Sort */}
                    <div className="flex items-center gap-1.5">
                      <span className="mr-0.5 text-xs text-foreground/50">Sort</span>
                      {(["confidence", "seeders", "size", "age"] as const).map((col) => (
                        <button key={col} onClick={() => toggleSort(col)} className={cn("inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-xl text-xs transition-colors", torrentSort === col ? "bg-background font-medium text-foreground" : "text-foreground/40")}>
                          {{ confidence: "Score", seeders: "Seeds", size: "Size", age: "Age" }[col]}
                          {torrentSort === col && (torrentSortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop: always visible filters */}
            <div className="hidden md:block">
              {/* Search */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter results..."
                  value={torrentSearchQuery}
                  onChange={(e) => { setTorrentSearchQuery(e.target.value); setTorrentPage(0); }}
                  className="h-10 rounded-xl bg-muted/40 pl-10 text-sm border-0 focus-visible:ring-1"
                />
              </div>
              {/* Filters + Sort */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <select value={torrentQualityFilter} onChange={(e) => { setTorrentQualityFilter(e.target.value); setTorrentPage(0); }} className="h-8 rounded-lg bg-muted/60 px-2.5 text-xs text-foreground outline-none">
                  <option value="all">Quality</option><option value="uhd">4K</option><option value="fullhd">1080p</option><option value="hd">720p</option><option value="sd">SD</option>
                </select>
                <select value={torrentSourceFilter} onChange={(e) => { setTorrentSourceFilter(e.target.value); setTorrentPage(0); }} className="h-8 rounded-lg bg-muted/60 px-2.5 text-xs text-foreground outline-none">
                  <option value="all">Source</option><option value="remux">Remux</option><option value="bluray">Blu-Ray</option><option value="webdl">WEB-DL</option><option value="webrip">WEBRip</option><option value="hdtv">HDTV</option>
                </select>
                <select value={torrentSizeFilter} onChange={(e) => { setTorrentSizeFilter(e.target.value); setTorrentPage(0); }} className="h-8 rounded-lg bg-muted/60 px-2.5 text-xs text-foreground outline-none">
                  <option value="all">Size</option><option value="small">&lt; 2 GB</option><option value="medium">2–10 GB</option><option value="large">&gt; 10 GB</option>
                </select>
                <div className="mx-1 h-4 w-px bg-border/50" />
                <span className="text-xs text-muted-foreground/60">Sort</span>
                <div className="flex items-center gap-0.5">
                  {(["confidence", "seeders", "size", "age"] as const).map((col) => (
                    <button key={col} onClick={() => toggleSort(col)} className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs transition-colors", torrentSort === col ? "bg-muted/60 font-medium text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground")}>
                      {{ confidence: "Score", seeders: "Seeds", size: "Size", age: "Age" }[col]}
                      {torrentSort === col && (torrentSortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Season pills */}
            {!isSeasonPreselected && media.type === "show" && media.seasons && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Season</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={cn(
                      "h-8 rounded-xl px-3 text-xs font-medium transition-colors",
                      torrentSearchContext?.seasonNumber === undefined
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => { setTorrentSearchContext(null); setTorrentSearchQuery(""); setTorrentPage(0); }}
                  >
                    All
                  </button>
                  {media.seasons
                    .filter((s) => s.number > 0)
                    .sort((a, b) => a.number - b.number)
                    .map((s) => (
                      <button
                        key={s.number}
                        className={cn(
                          "h-8 rounded-xl px-3 text-xs font-medium transition-colors",
                          torrentSearchContext?.seasonNumber === s.number
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => { setTorrentSearchContext({ seasonNumber: s.number }); setTorrentSearchQuery(""); setTorrentPage(0); }}
                      >
                        S{s.number.toString().padStart(2, "0")}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Table results */}
          <div className="min-h-0 flex-1 overflow-y-auto">
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
              <div className="flex flex-col gap-3 p-4">
                {paginatedTorrents.map((t, i) => {
                  const url = t.magnetUrl ?? t.downloadUrl;
                  const qLabel = formatQualityLabel(t.quality);
                  const sLabel = sourceLabel(t.source);
                  const hasFreeleech = t.flags.some((f) => f.includes("freeleech"));
                  return (
                    <div
                      key={`${t.guid}-${i}`}
                      className="overflow-hidden rounded-xl bg-muted/40 transition-colors hover:bg-muted/60"
                    >
                      {/* Header: Indexer (language) + Age */}
                      <div className="flex items-center justify-between px-5 py-2.5 text-xs text-muted-foreground">
                        <span>
                          {t.indexer || "Unknown"}
                          {t.indexerLanguage && (
                            <span className="ml-1 text-muted-foreground/50">({t.indexerLanguage})</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatAge(t.age)}
                        </span>
                      </div>

                      {/* Body: Score + Title + Quality info + Download */}
                      <div className="flex items-start gap-4 border-t border-border/50 px-5 py-4">
                        {/* Confidence */}
                        <div className={cn(
                          "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
                          t.confidence >= 70 ? "bg-green-500/10 text-green-400" :
                          t.confidence >= 40 ? "bg-yellow-500/10 text-yellow-400" :
                          "bg-muted text-muted-foreground",
                        )}>
                          {t.confidence}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                            {t.title}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                            {qLabel && (
                              <span className="flex items-center gap-1.5">
                                <Monitor size={12} className="text-muted-foreground/50" />
                                <span className="font-medium text-foreground/80">{qLabel}</span>
                              </span>
                            )}
                            {sLabel && (
                              <span className="flex items-center gap-1.5">
                                <FilmIcon size={12} className="text-muted-foreground/50" />
                                {sLabel}
                              </span>
                            )}
                            {t.size > 0 && (
                              <span className="flex items-center gap-1.5">
                                <HardDrive size={12} className="text-muted-foreground/50" />
                                {formatBytes(t.size)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Download button */}
                        <button
                          onClick={() => url && handleDownload(url, t.title)}
                          disabled={!url || downloadTorrent.isPending}
                          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:scale-110 hover:text-foreground disabled:opacity-40"
                        >
                          <Download size={16} />
                        </button>
                      </div>

                      {/* Footer: Seeds + Peers + Languages + Freeleech */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 px-5 py-2.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-foreground/70">
                          <ArrowUp size={12} className="text-muted-foreground/50" />
                          {t.seeders} seeders
                        </span>
                        <span className="flex items-center gap-1.5">
                          <ArrowDown size={12} className="text-muted-foreground/50" />
                          {t.leechers} peers
                        </span>
                        {t.languages.length > 0 && (
                          <span className="flex items-center gap-1.5">
                            <Globe size={12} className="text-muted-foreground/50" />
                            {t.languages.map((l) => l.toUpperCase()).join(", ")}
                          </span>
                        )}
                        {hasFreeleech && (
                          <span className="flex items-center gap-1.5 font-medium text-blue-400">
                            <Zap size={12} />
                            Freeleech
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center px-5 py-12 text-center">
                {advancedSearch && !committedQuery ? (
                  <div>
                    <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Type a query and press Enter
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      Search across all indexers with a custom query.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      No results found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      Check your indexer configuration in Prowlarr.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          {(torrentPage > 0 || hasMore) && (
            <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-3">
              <span className="text-xs text-muted-foreground">
                Page {torrentPage + 1}
                {allFilteredTorrents.length > 0 && (
                  <> &middot; {allFilteredTorrents.length} result{allFilteredTorrents.length !== 1 ? "s" : ""}</>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={torrentPage === 0}
                  onClick={() => setTorrentPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!hasMore}
                  onClick={() => setTorrentPage((p) => p + 1)}
                >
                  Next
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
                width={480}
                height={360}
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

function VideoCarouselSkeleton(): React.JSX.Element {
  return (
    <section className="relative">
      <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="flex gap-4 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-video w-[300px] shrink-0 rounded-xl sm:w-[340px] lg:w-[380px]"
          />
        ))}
      </div>
    </section>
  );
}

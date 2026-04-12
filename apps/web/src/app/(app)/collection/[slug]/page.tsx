"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import type {FilterOutput} from "~/components/media/filter-sidebar";
import type { ViewMode } from "~/components/layout/view-mode-toggle";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { StateMessage } from "~/components/layout/state-message";
import { PageHeader } from "~/components/layout/page-header";
import { CollectionEditPopover } from "../../library/_components/collection-edit-popover";
import { CollectionMembersDialog } from "../../library/_components/collection-members-dialog";
import { ListFilterSidebar } from "./_components/list-filter-sidebar";
import { ListContent } from "./_components/list-content";

const PAGE_SIZE = 20;
const VIEW_MODE_KEY = "canto.collection.viewMode";

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug;

  const initialTypeFilter = ((): "all" | "movie" | "show" => {
    const t = searchParams.get("type");
    return t === "movie" || t === "show" ? t : "all";
  })();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">(initialTypeFilter);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? "grid";
  });
  const [shareListId, setShareListId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.list.delete.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      toast.success("Collection deleted");
      router.push("/library/collections");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.list.getBySlug.useInfiniteQuery(
      {
        slug,
        limit: PAGE_SIZE,
        genreIds: filters.genreIds,
        genreMode: filters.genreMode,
        language: filters.language,
        scoreMin: filters.scoreMin,
        yearMin: filters.yearMin,
        yearMax: filters.yearMax,
        runtimeMin: filters.runtimeMin,
        runtimeMax: filters.runtimeMax,
        certification: filters.certification,
        status: filters.status,
        sortBy: filters.sortBy,
        watchProviders: filters.watchProviders,
        watchRegion: filters.watchRegion,
      },
      {
        getNextPageParam: (lastPage, _allPages, lastPageParam) => {
          const currentOffset = lastPageParam as number;
          const nextOffset = currentOffset + PAGE_SIZE;
          if (nextOffset >= lastPage.total) return undefined;
          return nextOffset;
        },
        initialCursor: 0,
      },
    );

  useDocumentTitle(data?.pages[0]?.list.name);

  const handleFilterChange = useCallback((f: FilterOutput) => setFilters(f), []);

  const listId = data?.pages[0]?.list.id;

  const baseItems = useMemo(() => {
    const all =
      data?.pages.flatMap((page) =>
        page.items.map((item) => ({
          id: item.media.id,
          externalId: String(item.media.externalId),
          provider: item.media.provider,
          type: item.media.type as "movie" | "show",
          title: item.media.title,
          posterPath: item.media.posterPath,
          year: item.media.year ?? undefined,
          voteAverage: item.media.voteAverage ?? undefined,
          overview: item.media.overview ?? undefined,
        })),
      ) ?? [];

    return typeFilter === "all" ? all : all.filter((i) => i.type === typeFilter);
  }, [data, typeFilter]);

  // Fetch vote aggregation for visible items
  const mediaIds = useMemo(() => baseItems.map((i) => i.id).filter(Boolean), [baseItems]);
  const { data: votes } = trpc.list.getVotes.useQuery(
    { listId: listId!, mediaIds },
    { enabled: !!listId && mediaIds.length > 0 },
  );

  const items = useMemo(() => {
    if (!votes || votes.length === 0) return baseItems;
    const voteMap = new Map(votes.map((v) => [v.mediaId, v]));
    return baseItems.map((item) => {
      const vote = item.id ? voteMap.get(item.id) : undefined;
      if (!vote) return item;
      return {
        ...item,
        totalRating: vote.totalRating,
        voteCount: vote.voteCount,
      };
    });
  }, [baseItems, votes]);

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) handleFetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleFetchNextPage]);

  if (error) {
    return (
      <StateMessage
        preset="notFoundList"
        action={{ label: "Back to Library", onClick: () => router.push("/library") }}
        minHeight="400px"
      />
    );
  }

  const listRow = data?.pages[0]?.list;

  return (
    <div className="w-full pb-12">
      <PageHeader
        title={listRow?.name ?? "List"}
        subtitle={listRow?.description ?? undefined}
        action={
          listRow && listRow.type === "custom" ? (
            <CollectionEditPopover
              list={{
                id: listRow.id,
                name: listRow.name,
                description: listRow.description,
                visibility: listRow.visibility,
              }}
              onDelete={(id, nameValue) => setDeleteTarget({ id, name: nameValue })}
              onShare={(id) => setShareListId(id)}
              triggerClassName="relative right-auto top-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-foreground hover:bg-accent/70"
            />
          ) : undefined
        }
      />

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ListFilterSidebar
          mediaType={typeFilter}
          visible={showFilters}
          onFilterChange={handleFilterChange}
        />

        <ListContent
          items={items}
          isLoading={isLoading}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          sentinelRef={sentinelRef}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
        />
      </div>

      <CollectionMembersDialog
        listId={shareListId}
        open={!!shareListId}
        onOpenChange={(open) => { if (!open) setShareListId(null); }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

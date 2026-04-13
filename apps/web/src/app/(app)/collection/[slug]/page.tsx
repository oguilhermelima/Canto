"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { DropdownMenuItem } from "@canto/ui/dropdown-menu";
import { Trash2, Users } from "lucide-react";
import { BrowseLayout } from "~/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "~/components/layout/browse-layout";
import { collectionStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "~/components/layout/state-message";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useViewMode } from "~/hooks/use-view-mode";
import { CollectionEditPopover } from "../../library/_components/collection-edit-popover";
import { CollectionMembersDialog } from "../../library/_components/collection-members-dialog";

const PAGE_SIZE = 20;

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.collection.viewMode");
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

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.list.getBySlug.useInfiniteQuery(
      {
        slug,
        limit: PAGE_SIZE,
        genreIds: filters.genreIds,
        genreMode: filters.genreMode,
        language: filters.language,
        scoreMin: filters.scoreMin,
        scoreMax: filters.scoreMax,
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

  const items: BrowseItem[] = useMemo(() => {
    const voteMap = votes && votes.length > 0
      ? new Map(votes.map((v) => [v.mediaId, v]))
      : null;

    return baseItems.map((item) => {
      const vote = voteMap?.get(item.id);
      return {
        ...item,
        totalRating: vote?.totalRating,
        voteCount: vote?.voteCount,
      };
    });
  }, [baseItems, votes]);

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    <>
      <BrowseLayout
        title={listRow?.name ?? "List"}
        subtitle={listRow?.description ?? undefined}
        titleAction={
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
        menuContent={
          listRow && listRow.type === "custom" ? (
            <>
              <DropdownMenuItem onClick={() => setShareListId(listRow.id)}>
                <Users className="mr-2 h-4 w-4" />
                Manage members
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteTarget({ id: listRow.id, name: listRow.name })}
                className="text-red-400 focus:text-red-300"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete collection
              </DropdownMenuItem>
            </>
          ) : undefined
        }
        items={items}
        strategy={collectionStrategy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        onFetchNextPage={handleFetchNextPage}
        filterPreset="tmdb"
        onFilterChange={setFilters}
        mediaType={typeFilter}
        onMediaTypeChange={setTypeFilter}
        emptyState={
          <StateMessage
            preset="emptyList"
            action={{ label: "Discover Media", onClick: () => router.push("/") }}
          />
        }
      />

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
    </>
  );
}

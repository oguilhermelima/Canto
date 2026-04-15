"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Eye, EyeOff, Globe, Loader2, Lock, Pencil, Trash2, Users } from "lucide-react";
import { BrowseLayout } from "~/components/layout/browse-layout";
import type { FilterOutput, BrowseItem, BrowseMenuGroup } from "~/components/layout/browse-layout";
import { collectionStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "~/components/layout/state-message";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useViewMode } from "~/hooks/use-view-mode";
import { CollectionMembersDialog } from "../../library/_components/collection-members-dialog";

const PAGE_SIZE = 20;

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private", icon: Lock },
  { value: "shared", label: "Shared", icon: Users },
  { value: "public", label: "Public", icon: Globe },
] as const;

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.collection.viewMode");
  const [shareListId, setShareListId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const utils = trpc.useUtils();
  const layoutQuery = trpc.list.getCollectionLayout.useQuery();
  const updateLayoutMutation = trpc.list.updateCollectionLayout.useMutation({
    onSuccess: (next) => {
      utils.list.getCollectionLayout.setData(undefined, next);
    },
  });

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

  const hiddenIds = layoutQuery.data?.hiddenListIds ?? [];
  const isHidden = listRow ? hiddenIds.includes(listRow.id) : false;

  const toggleHidden = (): void => {
    if (!listRow) return;
    const nextHidden = isHidden
      ? hiddenIds.filter((id) => id !== listRow.id)
      : [...hiddenIds, listRow.id];
    const dedupedHidden = [...new Set(nextHidden)];
    utils.list.getCollectionLayout.setData(undefined, { hiddenListIds: dedupedHidden });
    updateLayoutMutation.mutate({ hiddenListIds: dedupedHidden });
    toast.success(isHidden ? "Collection visible" : "Collection hidden");
  };

  const menuGroups: BrowseMenuGroup[] | undefined = listRow
    ? [
        ...(listRow.type === "custom"
          ? [
              {
                label: "Manage Collection",
                items: [
                  { label: "Edit collection", icon: Pencil, onClick: () => setEditOpen(true) },
                  { label: "Manage members", icon: Users, onClick: () => setShareListId(listRow.id) },
                  { label: "Delete collection", icon: Trash2, onClick: () => setDeleteTarget({ id: listRow.id, name: listRow.name }), className: "text-red-400" },
                ],
              },
            ]
          : []),
        {
          label: "Collection",
          items: [
            {
              label: isHidden ? "Show collection" : "Hide collection",
              icon: isHidden ? Eye : EyeOff,
              onClick: toggleHidden,
            },
          ],
        },
      ]
    : undefined;

  return (
    <>
      <BrowseLayout
        title={listRow?.name ?? "List"}
        subtitle={listRow?.description ?? undefined}
        menuGroups={menuGroups}
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

      {/* Edit collection dialog */}
      {listRow && listRow.type === "custom" && (
        <EditCollectionDialog
          list={listRow}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

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

/* ─── Edit Collection Dialog ─── */

function EditCollectionDialog({
  list,
  open,
  onOpenChange,
}: {
  list: { id: string; name: string; description: string | null; visibility?: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [editName, setEditName] = useState(list.name);
  const [editDescription, setEditDescription] = useState(list.description ?? "");
  const [editVisibility, setEditVisibility] = useState(list.visibility ?? "private");
  const utils = trpc.useUtils();

  const updateMutation = trpc.list.update.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      void utils.list.getBySlug.invalidate();
      onOpenChange(false);
      toast.success("Collection updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (): void => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    const changes: { id: string; name?: string; description?: string; visibility?: "public" | "private" | "shared" } = { id: list.id };
    if (trimmedName !== list.name) changes.name = trimmedName;
    const trimmedDesc = editDescription.trim();
    if (trimmedDesc !== (list.description ?? "")) changes.description = trimmedDesc;
    if (editVisibility !== (list.visibility ?? "private")) changes.visibility = editVisibility as "public" | "private" | "shared";
    if (!changes.name && !changes.description && !changes.visibility) { onOpenChange(false); return; }
    updateMutation.mutate(changes);
  };

  // Reset fields when dialog opens
  const handleOpenChange = (v: boolean): void => {
    if (v) {
      setEditName(list.name);
      setEditDescription(list.description ?? "");
      setEditVisibility(list.visibility ?? "private");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-w-md flex-col max-md:fixed max-md:inset-0 max-md:h-full max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0">
        <DialogHeader className="text-left">
          <DialogTitle>Edit Collection</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              variant="ghost"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input
              variant="ghost"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Optional description"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
            <Select value={editVisibility} onValueChange={setEditVisibility}>
              <SelectTrigger className="rounded-xl border-none bg-accent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-4">
          <Button className="w-full rounded-xl" onClick={handleSave} disabled={!editName.trim() || updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

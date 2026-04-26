"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
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
import { CheckSquare, Eye, EyeOff, Globe, Loader2, Lock, Pencil, Trash2, Users } from "lucide-react";
import { BrowseLayout } from "@/components/layout/browse-layout";
import type { FilterOutput, BrowseItem, BrowseMenuGroup, CardStrategy } from "@/components/layout/browse-layout";
import { collectionStrategy } from "@/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useViewMode } from "@/hooks/use-view-mode";
import { CollectionMembersDialog } from "../../library/_components/collection-members-dialog";
import { CardActionsMenu } from "./_components/card-actions-menu";
import { MoveItemsDialog } from "./_components/move-items-dialog";
import { SelectableItem } from "./_components/selectable-item";
import { SelectionBar } from "./_components/selection-bar";

const PAGE_SIZE = 20;

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private", icon: Lock },
  { value: "shared", label: "Shared", icon: Users },
  { value: "public", label: "Public", icon: Globe },
] as const;

const DEFAULT_SORT_OPTIONS = [
  { value: "date_added.desc", label: "Date Added (Newest)" },
  { value: "date_added.asc", label: "Date Added (Oldest)" },
  { value: "title.asc", label: "Name A–Z" },
  { value: "title.desc", label: "Name Z–A" },
  { value: "primary_release_date.desc", label: "Release Date (Newest)" },
  { value: "primary_release_date.asc", label: "Release Date (Oldest)" },
  { value: "vote_average.desc", label: "Public Rating" },
  { value: "members_rating.desc", label: "Members Rating" },
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState(false);

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

  const watchStatuses = filters.watchStatuses as
    | ("planned" | "watching" | "completed" | "dropped" | "none")[]
    | undefined;

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.list.getBySlug.useInfiniteQuery(
      {
        slug,
        limit: PAGE_SIZE,
        q: filters.q,
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
        membersRatingMin: filters.membersRatingMin,
        watchStatuses,
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

  const items: BrowseItem[] = useMemo(() => {
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
          totalRating: item.memberVotes?.totalRating,
          voteCount: item.memberVotes?.voteCount,
          membersAvg: item.memberVotes?.avgRating,
          userRating: item.userRating,
          userStatus: item.userStatus as BrowseItem["userStatus"],
          membership: item.membership,
        })),
      ) ?? [];

    return typeFilter === "all" ? all : all.filter((i) => i.type === typeFilter);
  }, [data, typeFilter]);

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const listRow = data?.pages[0]?.list;

  const canSelect =
    listRow?.type === "custom" || listRow?.type === "watchlist";

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const invalidateAfterMutation = useCallback(() => {
    void utils.list.getBySlug.invalidate();
    void utils.list.getAll.invalidate();
    void utils.list.getAllCollectionItems.invalidate();
  }, [utils]);

  const removeItemsMutation = trpc.list.removeItems.useMutation({
    onSuccess: (res) => {
      toast.success(`Removed ${res.count} items`);
      invalidateAfterMutation();
      exitSelection();
      setBulkRemoveConfirmOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const moveItemsMutation = trpc.list.moveItems.useMutation({
    onSuccess: (res) => {
      toast.success(`Moved ${res.count} items`);
      invalidateAfterMutation();
      exitSelection();
      setMoveOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const wrappedStrategy: CardStrategy = useMemo(() => {
    if (selectionMode) {
      return {
        ...collectionStrategy,
        gridCard: (item) => (
          <SelectableItem
            selected={selectedIds.has(item.id)}
            onToggle={() => toggleSelected(item.id)}
            variant="grid"
          >
            {collectionStrategy.gridCard(item)}
          </SelectableItem>
        ),
        listCard: (item) => (
          <SelectableItem
            selected={selectedIds.has(item.id)}
            onToggle={() => toggleSelected(item.id)}
            variant="list"
          >
            {collectionStrategy.listCard(item)}
          </SelectableItem>
        ),
      };
    }

    if (!listRow) return collectionStrategy;
    const wrap = (variant: "grid" | "list") => (item: BrowseItem) => (
      <CardActionsMenu
        mediaId={item.id}
        mediaTitle={item.title}
        currentListId={listRow.id}
        currentListName={listRow.name}
        canRemove={canSelect}
        variant={variant}
      >
        {variant === "grid"
          ? collectionStrategy.gridCard(item)
          : collectionStrategy.listCard(item)}
      </CardActionsMenu>
    );
    return {
      ...collectionStrategy,
      gridCard: wrap("grid"),
      listCard: wrap("list"),
    };
  }, [selectionMode, selectedIds, toggleSelected, listRow, canSelect]);

  if (error) {
    return (
      <StateMessage
        preset="notFoundList"
        action={{ label: "Back to Library", onClick: () => router.push("/library") }}
        minHeight="400px"
      />
    );
  }

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

  const enterSelection = (): void => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  };

  const menuGroups: BrowseMenuGroup[] | undefined = listRow
    ? [
        ...(canSelect
          ? [
              {
                label: "Items",
                items: [
                  {
                    label: "Select items",
                    icon: CheckSquare,
                    onClick: enterSelection,
                  },
                ],
              },
            ]
          : []),
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

  const selectedArray = Array.from(selectedIds);

  const groupByFn = listRow?.groupByStatus
    ? (item: BrowseItem): string | null => {
        switch (item.userStatus) {
          case "watching": return "Watching";
          case "completed": return "Completed";
          case "planned": return "Planning";
          case "dropped": return "Dropped";
          default: return "Not Tracked";
        }
      }
    : undefined;

  return (
    <>
      <BrowseLayout
        title={listRow?.name ?? "List"}
        subtitle={listRow?.description ?? undefined}
        menuGroups={menuGroups}
        items={items}
        strategy={wrappedStrategy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        onFetchNextPage={handleFetchNextPage}
        filterPreset="tmdb"
        onFilterChange={setFilters}
        showMembersRating
        defaultSort={listRow?.defaultSortBy}
        groupBy={groupByFn}
        mediaType={typeFilter}
        onMediaTypeChange={setTypeFilter}
        emptyState={
          <StateMessage
            preset="emptyList"
            action={{ label: "Discover Media", onClick: () => router.push("/") }}
          />
        }
      />

      {selectionMode && listRow && (
        <SelectionBar
          count={selectedIds.size}
          onCancel={exitSelection}
          onRemove={() => setBulkRemoveConfirmOpen(true)}
          onMove={() => setMoveOpen(true)}
          removePending={removeItemsMutation.isPending}
          movePending={moveItemsMutation.isPending}
        />
      )}

      {listRow && (
        <MoveItemsDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          sourceListId={listRow.id}
          itemCount={selectedIds.size}
          pending={moveItemsMutation.isPending}
          onPick={(targetListId) => {
            moveItemsMutation.mutate({
              fromListId: listRow.id,
              toListId: targetListId,
              mediaIds: selectedArray,
            });
          }}
        />
      )}

      <Dialog
        open={bulkRemoveConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setBulkRemoveConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {selectedIds.size} items?</DialogTitle>
            <DialogDescription>
              These items will be removed from &quot;{listRow?.name}&quot;. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkRemoveConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => {
                if (!listRow) return;
                removeItemsMutation.mutate({
                  listId: listRow.id,
                  mediaIds: selectedArray,
                });
              }}
              disabled={removeItemsMutation.isPending}
            >
              {removeItemsMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

interface EditCollectionList {
  id: string;
  name: string;
  description: string | null;
  visibility?: string;
  defaultSortBy?: string;
  groupByStatus?: boolean;
  hideCompleted?: boolean;
  hideDropped?: boolean;
  showHidden?: boolean;
}

function EditCollectionDialog({
  list,
  open,
  onOpenChange,
}: {
  list: EditCollectionList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [editName, setEditName] = useState(list.name);
  const [editDescription, setEditDescription] = useState(list.description ?? "");
  const [editVisibility, setEditVisibility] = useState(list.visibility ?? "private");
  const [editDefaultSort, setEditDefaultSort] = useState(list.defaultSortBy ?? "date_added.desc");
  const [editGroupByStatus, setEditGroupByStatus] = useState(list.groupByStatus ?? false);
  const [editHideCompleted, setEditHideCompleted] = useState(list.hideCompleted ?? false);
  const [editHideDropped, setEditHideDropped] = useState(list.hideDropped ?? false);
  const [editShowHidden, setEditShowHidden] = useState(list.showHidden ?? false);
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
    const changes: Parameters<typeof updateMutation.mutate>[0] = { id: list.id };
    if (trimmedName !== list.name) changes.name = trimmedName;
    const trimmedDesc = editDescription.trim();
    if (trimmedDesc !== (list.description ?? "")) changes.description = trimmedDesc;
    if (editVisibility !== (list.visibility ?? "private")) changes.visibility = editVisibility as "public" | "private" | "shared";
    if (editDefaultSort !== (list.defaultSortBy ?? "date_added.desc")) {
      changes.defaultSortBy = editDefaultSort as typeof changes.defaultSortBy;
    }
    if (editGroupByStatus !== (list.groupByStatus ?? false)) changes.groupByStatus = editGroupByStatus;
    if (editHideCompleted !== (list.hideCompleted ?? false)) changes.hideCompleted = editHideCompleted;
    if (editHideDropped !== (list.hideDropped ?? false)) changes.hideDropped = editHideDropped;
    if (editShowHidden !== (list.showHidden ?? false)) changes.showHidden = editShowHidden;
    if (Object.keys(changes).length === 1) { onOpenChange(false); return; }
    updateMutation.mutate(changes);
  };

  const handleOpenChange = (v: boolean): void => {
    if (v) {
      setEditName(list.name);
      setEditDescription(list.description ?? "");
      setEditVisibility(list.visibility ?? "private");
      setEditDefaultSort(list.defaultSortBy ?? "date_added.desc");
      setEditGroupByStatus(list.groupByStatus ?? false);
      setEditHideCompleted(list.hideCompleted ?? false);
      setEditHideDropped(list.hideDropped ?? false);
      setEditShowHidden(list.showHidden ?? false);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-w-md flex-col max-md:fixed max-md:inset-0 max-md:h-full max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0">
        <DialogHeader className="text-left">
          <DialogTitle>Edit Collection</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto">
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

          <div className="border-t border-border pt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Default Sort</label>
              <Select value={editDefaultSort} onValueChange={setEditDefaultSort}>
                <SelectTrigger className="rounded-xl border-none bg-accent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ToggleRow
              label="Group by status"
              hint="Group items by Watching, Completed, etc."
              checked={editGroupByStatus}
              onCheckedChange={setEditGroupByStatus}
            />
            <ToggleRow
              label="Hide completed"
              hint="Skip items you've already completed"
              checked={editHideCompleted}
              onCheckedChange={setEditHideCompleted}
            />
            <ToggleRow
              label="Hide dropped"
              hint="Skip items you've dropped"
              checked={editHideDropped}
              onCheckedChange={setEditHideDropped}
            />
            <ToggleRow
              label="Show hidden media"
              hint="Reveal items you've hidden from cards"
              checked={editShowHidden}
              onCheckedChange={setEditShowHidden}
            />
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

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

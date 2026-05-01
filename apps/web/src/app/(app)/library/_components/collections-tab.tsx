"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
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
  Bookmark,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Server,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { StateMessage } from "@canto/ui/state-message";
import { CollectionEditPopover } from "./collection-edit-popover";
import { CollectionMembersDialog } from "./collection-members-dialog";
import type { CollectionFilterState } from "./collection-filter-sidebar";

const PAGE_SIZE = 12;

export function CollectionsTab({
  filters,
}: {
  filters: CollectionFilterState;
}): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [shareListId, setShareListId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();
  const layoutQuery = trpc.list.getCollectionLayout.useQuery();

  const createMutation = trpc.list.create.useMutation({
    onSuccess: (newList) => {
      void utils.list.getAll.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("Collection created");
      router.push(`/collection/${newList.slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.list.delete.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      setDeleteTarget(null);
      toast.success("Collection deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.list.reorderCollections.useMutation({
    onError: () => {
      void utils.list.getAll.invalidate();
      toast.error("Failed to reorder");
    },
  });

  const updateLayoutMutation = trpc.list.updateCollectionLayout.useMutation({
    onSuccess: (nextLayout) => {
      utils.list.getCollectionLayout.setData(undefined, nextLayout);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = (): void => {
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const searchQuery = filters.searchQuery.trim().toLowerCase();
  const canReorder = searchQuery.length === 0;

  // DB returns lists in position order. Show only user-created collections;
  // watchlist + server library are promoted to the /library hub directly.
  const mergedLists = useMemo(() => {
    const all = (lists ?? []).filter((list) => list.type === "custom");
    if (!searchQuery) return all;

    const filtered = all.filter((list) =>
      list.name.toLowerCase().includes(searchQuery),
    );

    const dir = filters.sortOrder === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (filters.sortBy === "name") return dir * a.name.localeCompare(b.name);
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, [lists, filters.sortBy, filters.sortOrder, searchQuery]);

  const hiddenIds = useMemo(
    () => layoutQuery.data?.hiddenListIds ?? [],
    [layoutQuery.data?.hiddenListIds],
  );
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const hiddenCount = useMemo(
    () => mergedLists.filter((list) => hiddenSet.has(list.id)).length,
    [mergedLists, hiddenSet],
  );

  const visibleLists = useMemo(
    () => mergedLists.filter((list) => showHidden || !hiddenSet.has(list.id)),
    [mergedLists, showHidden, hiddenSet],
  );

  const visibleListIds = visibleLists.map((list) => list.id).join("|");
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    showHidden,
    searchQuery,
    visibleLists.length,
    visibleListIds,
  ]);

  const renderedLists = useMemo(
    () => visibleLists.slice(0, visibleCount),
    [visibleLists, visibleCount],
  );
  const hasMore = visibleCount < visibleLists.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + PAGE_SIZE, visibleLists.length));
      },
      { rootMargin: "220px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visibleLists.length]);

  const reorderByDrop = (sourceId: string, targetId: string): void => {
    if (sourceId === targetId) return;
    if (!canReorder) return;

    const currentIds: string[] = visibleLists.map((list) => list.id);
    const sourceIndex = currentIds.indexOf(sourceId);
    const targetIndex = currentIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reordered = [...currentIds];
    const [moved] = reordered.splice(sourceIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);

    // Optimistic: reorder the getAll cache. Only custom lists are in
    // `reordered`, so preserve non-custom rows (watchlist, server) afterwards.
    utils.list.getAll.setData(undefined, (prev) => {
      if (!prev) return prev;
      const map = new Map<string, (typeof prev)[number]>(
        prev.map((l) => [l.id, l]),
      );
      const reorderedLists = reordered
        .map((id) => map.get(id))
        .filter((l): l is NonNullable<typeof l> => !!l);
      const touched = new Set(reordered);
      const untouched = prev.filter((l) => !touched.has(l.id));
      return [...reorderedLists, ...untouched];
    });

    reorderMutation.mutate({ orderedIds: reordered });
  };

  const handleDrop = (targetId: string): void => {
    if (!draggedId) return;
    reorderByDrop(draggedId, targetId);
    setDraggedId(null);
    setDropTargetId(null);
  };

  const toggleHidden = (listId: string): void => {
    const isHidden = hiddenSet.has(listId);
    const nextHidden = isHidden
      ? hiddenIds.filter((id) => id !== listId)
      : [...hiddenIds, listId];

    const dedupedHidden = [...new Set(nextHidden)];
    utils.list.getCollectionLayout.setData(undefined, { hiddenListIds: dedupedHidden });
    updateLayoutMutation.mutate({ hiddenListIds: dedupedHidden });
  };

  const resetLayout = (): void => {
    setShowHidden(false);
    utils.list.getCollectionLayout.setData(undefined, { hiddenListIds: [] });
    updateLayoutMutation.mutate({ hiddenListIds: [] });
  };

  const hasAnyManagedList =
    (lists?.some((list) => list.type === "custom") ?? false) === true;

  return (
    <>
      {isLoading || layoutQuery.isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[108px] animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : isError || layoutQuery.isError ? (
        <StateMessage
          preset="error"
          onRetry={() => {
            void refetch();
            void layoutQuery.refetch();
          }}
        />
      ) : !hasAnyManagedList ? (
        <StateMessage
          preset="emptyCollections"
          action={{ label: "New Collection", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-xl text-xs",
                showHidden && "bg-accent text-foreground",
              )}
              onClick={() => setShowHidden((value) => !value)}
            >
              {showHidden ? "Hide hidden lists" : `Show hidden (${hiddenCount})`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-xs text-muted-foreground hover:text-foreground"
              onClick={resetLayout}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset order & visibility
            </Button>
            {!canReorder && (
              <span className="text-xs text-muted-foreground">
                Disable search to reorder with drag and drop.
              </span>
            )}
          </div>

          {visibleLists.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
              No lists match your search.
            </div>
          ) : (
            <div className="space-y-2.5">
              {renderedLists.map((list) => {
                const isHidden = hiddenSet.has(list.id);
                const isDropTarget = dropTargetId === list.id && draggedId !== null;
                return (
                  <div
                    key={list.id}
                    className={cn(
                      "group flex min-h-[108px] items-center gap-4 rounded-2xl border border-border bg-muted/20 px-4 py-3 transition-colors hover:bg-accent/50",
                      isHidden && showHidden && "opacity-60",
                      isDropTarget && "border-dashed border-primary bg-primary/5",
                    )}
                    onDragOver={(event) => {
                      if (!canReorder || !draggedId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetId(list.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = draggedId ?? event.dataTransfer.getData("text/plain");
                      if (!sourceId) return;
                      setDraggedId(sourceId);
                      handleDrop(list.id);
                    }}
                  >
                    <button
                      type="button"
                      draggable={canReorder}
                      onDragStart={(event) => {
                        if (!canReorder) return;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", list.id);
                        setDraggedId(list.id);
                        setDropTargetId(list.id);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropTargetId(null);
                      }}
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors",
                        canReorder
                          ? "cursor-grab hover:bg-background/80 hover:text-foreground active:cursor-grabbing"
                          : "cursor-not-allowed opacity-50",
                      )}
                      aria-label={`Reorder ${list.name}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <Link
                      href={`/collection/${list.slug}`}
                      className="flex min-w-0 flex-1 items-center gap-4"
                    >
                      <ListPreviewStack
                        posters={list.previewPosters}
                        type={list.type}
                      />

                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {list.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                          </span>
                          {(list.type === "watchlist" || list.type === "server") && (
                            <span className="rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium">
                              System
                            </span>
                          )}
                          {list.type === "custom" && (
                            <span className="flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium">
                              {list.visibility === "public" ? (
                                <><Globe className="h-3 w-3" /> Public</>
                              ) : list.visibility === "shared" ? (
                                <><Users className="h-3 w-3" /> Shared</>
                              ) : (
                                <><Lock className="h-3 w-3" /> Private</>
                              )}
                            </span>
                          )}
                          {isHidden && (
                            <span className="rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium">
                              Hidden
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                          isHidden
                            ? "text-foreground hover:bg-background/80"
                            : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                        )}
                        onClick={() => toggleHidden(list.id)}
                        aria-label={`${isHidden ? "Show" : "Hide"} ${list.name}`}
                      >
                        {isHidden ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>

                      {list.type === "custom" && (
                        <CollectionEditPopover
                          list={list}
                          onDelete={(id, nameValue) =>
                            setDeleteTarget({ id, name: nameValue })
                          }
                          onShare={(id) => setShareListId(id)}
                          triggerClassName="relative right-auto top-auto text-muted-foreground hover:bg-background/80 hover:text-foreground"
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <>
                  <div ref={sentinelRef} className="h-1" />
                  <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                    Loading more lists...
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="group flex min-h-[108px] w-full items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 transition-colors hover:border-foreground hover:bg-muted/40"
          >
            <div className="relative h-[90px] w-[110px] shrink-0">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-[90px] w-[58px] rounded-lg border border-border bg-background/70"
                  style={{ left: `${index * 20}px`, zIndex: index + 1 }}
                />
              ))}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-base font-semibold text-foreground">New Collection</p>
              <p className="text-xs text-muted-foreground">
                Create a custom list
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground">
              <Plus className="h-4 w-4" />
            </div>
          </button>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>
              Create a collection to organize your movies and shows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekend Binges"
                className="h-10"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Description{" "}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this collection for?"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CollectionMembersDialog
        listId={shareListId}
        open={!!shareListId}
        onOpenChange={(open) => { if (!open) setShareListId(null); }}
      />
    </>
  );
}

function posterSrc(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w185${path}`;
}

function ListPreviewStack({
  posters,
  type,
}: {
  posters: string[];
  type: string;
}): React.JSX.Element {
  const preview = posters.slice(0, 3);
  const Icon = type === "watchlist" ? Eye : type === "server" ? Server : Bookmark;

  return (
    <div className="relative h-[90px] w-[110px] shrink-0">
      {Array.from({ length: 3 }).map((_, index) => {
        const poster = preview[index];
        return (
          <div
            key={`${poster ?? "empty"}-${index}`}
            className="absolute top-0 h-[90px] w-[58px] overflow-hidden rounded-lg border border-background/40 bg-background/70 shadow-md"
            style={{ left: `${index * 20}px`, zIndex: index + 1 }}
          >
            {poster ? (
              <Image
                src={posterSrc(poster)}
                alt=""
                fill
                className="object-cover"
                sizes="58px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

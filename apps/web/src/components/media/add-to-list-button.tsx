"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canto/ui/sheet";
import { Bookmark, Check, Eye, Loader2, Plus, X } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { toast } from "sonner";

interface AddToListButtonProps {
  /** Internal media ID — if provided, used directly */
  mediaId?: string;
  /** External identifiers — used to persist media if mediaId is not available */
  externalId?: number | string;
  provider?: string;
  type?: "movie" | "show";
  title?: string;
  size?: "sm" | "lg";
  className?: string;
  /** Show standalone watchlist toggle button */
  showWatchlistToggle?: boolean;
  /** Include watchlist entry inside "Save to list" menu */
  includeWatchlistInMenu?: boolean;
  /** Called when any popover/sheet opens or closes */
  onOpenChange?: (open: boolean) => void;
}

export function AddToListButton({
  mediaId: initialMediaId,
  externalId,
  provider,
  type,
  title,
  size = "sm",
  className,
  showWatchlistToggle = true,
  includeWatchlistInMenu = false,
  onOpenChange,
}: AddToListButtonProps): React.JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const storageKey = provider && externalId ? `canto:inlist:${provider}-${externalId}` : null;

  const [optimisticWatchlist, setOptimisticWatchlist] = useState<
    boolean | null
  >(() => {
    // Restore from localStorage on mount (survives re-renders from carousel slides)
    if (typeof window === "undefined" || !storageKey) return null;
    const stored = localStorage.getItem(storageKey);
    return stored === "true" ? true : stored === "false" ? false : null;
  });
  const [resolvedMediaId, setResolvedMediaId] = useState<string | undefined>(
    initialMediaId,
  );
  const [resolving, setResolving] = useState(false);
  const utils = trpc.useUtils();

  const mediaId = resolvedMediaId ?? initialMediaId;

  const { data: lists } = trpc.list.getAll.useQuery();
  const { data: inLists } = trpc.list.isInLists.useQuery(
    { mediaId: mediaId! },
    { enabled: !!mediaId },
  );

  // Lazy resolve: persist media via getByExternal when needed
  const getByExternal = trpc.media.getByExternal.useQuery(
    {
      externalId: Number(externalId),
      provider: (provider ?? "tmdb") as "tmdb" | "tvdb",
      type: (type ?? "movie") as "movie" | "show",
    },
    { enabled: false }, // manual trigger only
  );

  const resolveMediaId = async (): Promise<string | undefined> => {
    if (mediaId) return mediaId;
    if (!externalId || !provider || !type) return undefined;

    setResolving(true);
    try {
      const result = await getByExternal.refetch();
      const id = result.data?.id;
      if (id) {
        setResolvedMediaId(id);
        return id;
      }
    } catch {
      toast.error("Failed to load media");
    } finally {
      setResolving(false);
    }
    return undefined;
  };

  const invalidate = (): void => {
    if (mediaId) {
      void utils.list.isInLists.invalidate({ mediaId });
    }
    void utils.list.getAll.invalidate();
    void utils.list.getBySlug.invalidate();
    // Don't invalidate recommendations/spotlight — let the item stay visible
    // with its "In Watchlist" badge until next natural refresh
  };

  const addItem = trpc.list.addItem.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      setWatchlistState(null);
      toast.error(err.message);
    },
  });

  const removeItem = trpc.list.removeItem.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      setWatchlistState(null);
      toast.error(err.message);
    },
  });

  const createList = trpc.list.create.useMutation({
    onSuccess: async (newList) => {
      invalidate();
      setNewListName("");
      setCreatingNew(false);
      toast.success(`Created "${newList.name}"`);
      const id = await resolveMediaId();
      if (id) {
        addItem.mutate(
          { listId: newList.id, mediaId: id },
          { onSuccess: () => toast.success(`Added to "${newList.name}"`) },
        );
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const inListIds = new Set(inLists?.map((l) => l.listId) ?? []);
  const watchlist = lists?.find((l) => l.type === "watchlist");
  // Persist optimistic state to localStorage so it survives carousel slide changes
  const setWatchlistState = (value: boolean | null): void => {
    setOptimisticWatchlist(value);
    if (storageKey) {
      if (value === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(value));
    }
  };

  const realWatchlistState = watchlist ? inListIds.has(watchlist.id) : false;
  const isInWatchlist = optimisticWatchlist ?? realWatchlistState;
  const hasSavedToAnyList = watchlist
    ? isInWatchlist ||
      Array.from(inListIds).some((listId) => listId !== watchlist.id)
    : inListIds.size > 0;

  // Filter: no server library; optionally include watchlist in menu
  const menuLists =
    lists
      ?.filter(
        (l) =>
          l.type !== "server" &&
          (includeWatchlistInMenu || l.type !== "watchlist"),
      )
      .sort((a, b) => Number(b.type === "watchlist") - Number(a.type === "watchlist")) ?? [];

  const toggleWatchlist = async (): Promise<void> => {
    if (!watchlist) return;

    if (isInWatchlist && mediaId) {
      setWatchlistState(false);
      removeItem.mutate(
        { listId: watchlist.id, mediaId },
        {
          onSuccess: () =>
            toast.success(
              title
                ? `Removed "${title}" from Watchlist`
                : "Removed from Watchlist",
            ),
        },
      );
    } else {
      setWatchlistState(true);
      const id = await resolveMediaId();
      if (!id) {
        setWatchlistState(null);
        return;
      }
      addItem.mutate(
        { listId: watchlist.id, mediaId: id },
        {
          onSuccess: () =>
            toast.success(
              title
                ? `Added "${title}" to Watchlist`
                : "Added to Watchlist",
            ),
        },
      );
    }
  };

  const toggleList = async (
    listId: string,
    listName: string,
  ): Promise<void> => {
    if (inListIds.has(listId) && mediaId) {
      removeItem.mutate(
        { listId, mediaId },
        { onSuccess: () => toast.success(`Removed from "${listName}"`) },
      );
    } else {
      const id = await resolveMediaId();
      if (!id) return;
      addItem.mutate(
        { listId, mediaId: id },
        { onSuccess: () => toast.success(`Added to "${listName}"`) },
      );
    }
  };

  const handleCreateList = (): void => {
    const name = newListName.trim();
    if (!name) return;
    createList.mutate({ name });
  };

  const isLoading =
    addItem.isPending || removeItem.isPending || resolving;
  const isSmall = size === "sm";
  const btnHeight = isSmall ? "h-8" : "h-11";
  const btnText = isSmall ? "text-xs" : "text-sm";
  const btnPx = isSmall ? "px-3" : "px-4";

  const posterUrl = (path: string | null | undefined): string | null =>
    path
      ? path.startsWith("http")
        ? path
        : `https://image.tmdb.org/t/p/w92${path}`
      : null;

  const listContent = (
    <div className="flex flex-col">
      <p className="px-1 pb-3 text-base font-bold">Save to...</p>

      {/* Existing lists */}
      <div className="-mx-1 max-h-[280px] space-y-0.5 overflow-y-auto">
        {menuLists.map((l) => {
          const thumb = posterUrl(l.previewPoster);
          const isWatchlistRow = l.type === "watchlist";
          const saved = isWatchlistRow ? isInWatchlist : inListIds.has(l.id);
          return (
            <button
              key={l.id}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-accent"
              onClick={() => {
                if (isWatchlistRow) {
                  void toggleWatchlist();
                  return;
                }
                void toggleList(l.id, l.name);
              }}
              disabled={isLoading}
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    {isWatchlistRow ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.itemCount} {l.itemCount === 1 ? "item" : "items"}
                </p>
              </div>
              {isWatchlistRow ? (
                <Eye
                  className={cn(
                    "h-5 w-5 shrink-0",
                    saved ? "text-foreground" : "text-muted-foreground",
                  )}
                />
              ) : (
                <Bookmark
                  className={cn(
                    "h-5 w-5 shrink-0",
                    saved
                      ? "fill-foreground text-foreground"
                      : "text-muted-foreground",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* New list */}
      <div className="mt-2 border-t border-border pt-2">
        {creatingNew ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name..."
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateList();
                if (e.key === "Escape") {
                  setCreatingNew(false);
                  setNewListName("");
                }
              }}
            />
            <Button
              size="sm"
              className="h-9 shrink-0 rounded-xl px-3"
              onClick={handleCreateList}
              disabled={!newListName.trim() || createList.isPending}
            >
              Create
            </Button>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/60 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            onClick={() => setCreatingNew(true)}
          >
            <Plus className="h-4 w-4" />
            New list
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showWatchlistToggle && (
        <button
          className={cn(
            "group/wl inline-flex items-center gap-2 rounded-xl font-medium transition-all duration-200",
            btnHeight,
            btnPx,
            btnText,
            isInWatchlist
              ? "bg-green-500/20 text-green-500 hover:bg-red-500/20 hover:text-red-500"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
          onClick={() => void toggleWatchlist()}
          disabled={!watchlist || isLoading}
        >
          {resolving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isInWatchlist ? (
            <>
              <Check className="h-4 w-4 transition-transform duration-200 group-hover/wl:hidden" />
              <X className="hidden h-4 w-4 transition-transform duration-200 group-hover/wl:block" />
            </>
          ) : (
            <Plus className="h-4 w-4 transition-transform duration-200" />
          )}
          <span className={isInWatchlist ? "group-hover/wl:hidden" : ""}>
            {isInWatchlist ? "In Watchlist" : "Watchlist"}
          </span>
          {isInWatchlist && (
            <span className="hidden group-hover/wl:inline">Remove</span>
          )}
        </button>
      )}

      {/* Save to list — Popover on desktop, Sheet on mobile */}
      {/* Desktop */}
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={(open) => { setPopoverOpen(open); onOpenChange?.(open); }}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-xl transition-colors",
                hasSavedToAnyList
                  ? "bg-foreground/25 hover:bg-foreground/30"
                  : "bg-foreground/15 hover:bg-foreground/25",
                btnHeight,
                isSmall ? "w-8" : "w-11",
              )}
              aria-label="Save to list"
              aria-pressed={hasSavedToAnyList}
            >
              <Bookmark
                className={cn(
                  "h-4 w-4 text-foreground",
                  hasSavedToAnyList && "fill-foreground",
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
            {listContent}
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); onOpenChange?.(open); }}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-xl transition-colors",
                hasSavedToAnyList
                  ? "bg-foreground/25 hover:bg-foreground/30"
                  : "bg-foreground/15 hover:bg-foreground/25",
                btnHeight,
                isSmall ? "w-8" : "w-11",
              )}
              aria-label="Save to list"
              aria-pressed={hasSavedToAnyList}
            >
              <Bookmark
                className={cn(
                  "h-4 w-4 text-foreground",
                  hasSavedToAnyList && "fill-foreground",
                )}
              />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader className="sr-only">
              <SheetTitle>Save to list</SheetTitle>
            </SheetHeader>
            <div className="pt-2">{listContent}</div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

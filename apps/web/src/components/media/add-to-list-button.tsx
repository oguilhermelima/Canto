"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Bookmark, Check, Loader2, Plus } from "lucide-react";
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
}

export function AddToListButton({
  mediaId: initialMediaId,
  externalId,
  provider,
  type,
  title,
  size = "sm",
  className,
}: AddToListButtonProps): React.JSX.Element {
  const router = useRouter();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [optimisticWatchlist, setOptimisticWatchlist] = useState<
    boolean | null
  >(null);
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
      provider: (provider ?? "tmdb") as "tmdb" | "anilist" | "tvdb",
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
  };

  const addItem = trpc.list.addItem.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      setOptimisticWatchlist(null);
      toast.error(err.message);
    },
    onSettled: () => setOptimisticWatchlist(null),
  });

  const removeItem = trpc.list.removeItem.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      setOptimisticWatchlist(null);
      toast.error(err.message);
    },
    onSettled: () => setOptimisticWatchlist(null),
  });

  const createList = trpc.list.create.useMutation({
    onSuccess: async (newList) => {
      invalidate();
      setNewListName("");
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
  const isInWatchlist =
    optimisticWatchlist ?? (watchlist ? inListIds.has(watchlist.id) : false);

  // Filter: no server library, no watchlist
  const userLists =
    lists?.filter((l) => l.type !== "server" && l.type !== "watchlist") ?? [];

  const toggleWatchlist = async (): Promise<void> => {
    if (!watchlist) return;

    if (isInWatchlist && mediaId) {
      setOptimisticWatchlist(false);
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
      setOptimisticWatchlist(true);
      const id = await resolveMediaId();
      if (!id) {
        setOptimisticWatchlist(null);
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
  const btnHeight = isSmall ? "h-8" : "h-10";
  const btnText = isSmall ? "text-xs" : "text-sm";
  const btnPx = isSmall ? "px-3" : "px-4";

  const listContent = (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        Save to list
      </p>

      {/* Existing lists */}
      <div className="max-h-[200px] space-y-0.5 overflow-y-auto">
        {userLists.map((l) => (
          <button
            key={l.id}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            onClick={() => void toggleList(l.id, l.name)}
            disabled={isLoading}
          >
            {inListIds.has(l.id) ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <div className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{l.name}</span>
          </button>
        ))}
      </div>

      {/* New list */}
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          New list
        </p>
        <div className="flex gap-2">
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="List name..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateList();
            }}
          />
          <Button
            size="sm"
            className="h-8 shrink-0 rounded-xl px-3"
            onClick={handleCreateList}
            disabled={!newListName.trim() || createList.isPending}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Watchlist toggle */}
      <button
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-white/10 font-medium text-foreground/80 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-foreground",
          btnHeight,
          btnPx,
          btnText,
        )}
        onClick={() => void toggleWatchlist()}
        disabled={!watchlist || isLoading}
      >
        {resolving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isInWatchlist ? (
          <Check className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {isInWatchlist ? "In Watchlist" : "Watchlist"}
      </button>

      {/* Save to list — Popover on desktop, Sheet on mobile */}
      {/* Desktop */}
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/15",
                btnHeight,
                isSmall ? "w-8" : "w-10",
              )}
              aria-label="Save to list"
            >
              <Bookmark className="h-4 w-4 text-foreground/80" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
            {listContent}
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/15",
                btnHeight,
                isSmall ? "w-8" : "w-10",
              )}
              aria-label="Save to list"
            >
              <Bookmark className="h-4 w-4 text-foreground/80" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle>Save to list</SheetTitle>
            </SheetHeader>
            <div className="pt-4">{listContent}</div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

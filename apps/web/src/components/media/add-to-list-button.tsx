"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { Bookmark, Check, Loader2, Plus } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { toast } from "sonner";

interface AddToListButtonProps {
  mediaId: string;
  title?: string;
  size?: "sm" | "lg";
  className?: string;
  variant?: "default" | "dark";
}

export function AddToListButton({
  mediaId,
  title,
  size = "sm",
  className,
  variant = "default",
}: AddToListButtonProps): React.JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [optimisticWatchlist, setOptimisticWatchlist] = useState<boolean | null>(null);
  const utils = trpc.useUtils();

  const { data: lists } = trpc.list.getAll.useQuery();
  const { data: inLists } = trpc.list.isInLists.useQuery({ mediaId });

  const invalidate = (): void => {
    void utils.list.isInLists.invalidate({ mediaId });
    void utils.list.getAll.invalidate();
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

  const inListIds = new Set(inLists?.map((l) => l.listId) ?? []);
  const watchlist = lists?.find((l) => l.type === "watchlist");
  const isInWatchlist =
    optimisticWatchlist ?? (watchlist ? inListIds.has(watchlist.id) : false);

  const toggleWatchlist = (): void => {
    if (!watchlist) return;

    if (isInWatchlist) {
      setOptimisticWatchlist(false);
      removeItem.mutate(
        { listId: watchlist.id, mediaId },
        { onSuccess: () => toast.success(title ? `Removed "${title}" from Watchlist` : "Removed from Watchlist") },
      );
    } else {
      setOptimisticWatchlist(true);
      addItem.mutate(
        { listId: watchlist.id, mediaId },
        { onSuccess: () => toast.success(title ? `Added "${title}" to Watchlist` : "Added to Watchlist") },
      );
    }
  };

  const toggleList = (listId: string, listName: string): void => {
    if (inListIds.has(listId)) {
      removeItem.mutate(
        { listId, mediaId },
        {
          onSuccess: () => toast.success(`Removed from "${listName}"`),
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      addItem.mutate(
        { listId, mediaId },
        {
          onSuccess: () => toast.success(`Added to "${listName}"`),
          onError: (err) => toast.error(err.message),
        },
      );
    }
  };

  const isLoading = addItem.isPending || removeItem.isPending;
  const isSmall = size === "sm";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Primary: Watchlist toggle */}
      <Button
        size={isSmall ? "sm" : "default"}
        variant={isInWatchlist ? "secondary" : variant === "dark" ? "secondary" : "default"}
        className={cn(
          "rounded-xl",
          isSmall ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        )}
        onClick={toggleWatchlist}
        disabled={!watchlist}
      >
        {isInWatchlist ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Bookmark className="mr-1.5 h-3.5 w-3.5" />
        )}
        {isInWatchlist ? "In Watchlist" : "Watchlist"}
      </Button>

      {/* Secondary: Add to other lists */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={cn("rounded-xl", isSmall ? "h-8 w-8" : "h-10 w-10")}
            aria-label="Add to list"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 max-h-[300px] overflow-y-auto p-2">
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
            Add to list
          </p>
          {lists
            ?.filter((l) => l.type !== "watchlist")
            .map((l) => (
              <button
                key={l.id}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                onClick={() => toggleList(l.id, l.name)}
                disabled={isLoading}
              >
                {inListIds.has(l.id) ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <div className="h-3.5 w-3.5" />
                )}
                <span className="truncate">{l.name}</span>
              </button>
            ))}
          {lists && lists.filter((l) => l.type !== "watchlist").length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No other lists yet
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

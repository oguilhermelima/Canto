"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Bookmark, Eye, Loader2, Plus } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

interface SaveToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  /** When true, the user's watchlist appears as a row in the list picker. */
  includeWatchlistInMenu?: boolean;
}

function posterUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w92${path}`;
}

export function SaveToListDialog({
  open,
  onOpenChange,
  mediaId,
  includeWatchlistInMenu = true,
}: SaveToListDialogProps): React.JSX.Element {
  const [newListName, setNewListName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  const utils = trpc.useUtils();
  const { data: lists } = trpc.list.getAll.useQuery(undefined, {
    enabled: open,
  });
  const { data: inLists } = trpc.list.isInLists.useQuery(
    { mediaId },
    { enabled: open && !!mediaId },
  );

  const invalidate = (): void => {
    void utils.list.isInLists.invalidate({ mediaId });
    void utils.list.getAll.invalidate();
    void utils.list.getBySlug.invalidate();
    void utils.list.getAllCollectionItems.invalidate();
  };

  const addItem = trpc.list.addItem.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const removeItem = trpc.list.removeItem.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const createList = trpc.list.create.useMutation({
    onSuccess: (newList) => {
      invalidate();
      setNewListName("");
      setCreatingNew(false);
      toast.success(`Created "${newList.name}"`);
      addItem.mutate(
        { listId: newList.id, mediaId },
        { onSuccess: () => toast.success(`Added to "${newList.name}"`) },
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const inListIds = new Set(inLists?.map((l) => l.listId) ?? []);
  const menuLists =
    lists
      ?.filter(
        (l) =>
          l.type !== "server" &&
          (includeWatchlistInMenu || l.type !== "watchlist"),
      )
      .sort(
        (a, b) =>
          Number(b.type === "watchlist") - Number(a.type === "watchlist"),
      ) ?? [];

  const busy =
    addItem.isPending || removeItem.isPending || createList.isPending;

  const toggleList = (listId: string, listName: string): void => {
    if (inListIds.has(listId)) {
      removeItem.mutate(
        { listId, mediaId },
        { onSuccess: () => toast.success(`Removed from "${listName}"`) },
      );
    } else {
      addItem.mutate(
        { listId, mediaId },
        { onSuccess: () => toast.success(`Added to "${listName}"`) },
      );
    }
  };

  const handleCreateList = (): void => {
    const name = newListName.trim();
    if (!name) return;
    createList.mutate({ name });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setCreatingNew(false);
          setNewListName("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save to…</DialogTitle>
        </DialogHeader>

        <div className="-mx-1 max-h-[50vh] space-y-0.5 overflow-y-auto">
          {menuLists.map((l) => {
            const thumb = posterUrl(l.previewPoster);
            const isWatchlistRow = l.type === "watchlist";
            const saved = inListIds.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent disabled:opacity-60"
                onClick={() => toggleList(l.id, l.name)}
                disabled={busy}
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
                      "h-5 w-5 shrink-0 transition-colors",
                      saved ? "text-emerald-400" : "text-muted-foreground",
                    )}
                  />
                ) : (
                  <Bookmark
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      saved
                        ? "fill-amber-500 text-amber-500"
                        : "text-muted-foreground",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 border-t border-border pt-3">
          {creatingNew ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name…"
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
                {createList.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Create
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/60 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() => setCreatingNew(true)}
            >
              <Plus className="h-4 w-4" />
              New list
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

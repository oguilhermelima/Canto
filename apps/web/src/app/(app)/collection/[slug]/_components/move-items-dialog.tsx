"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { StateMessage } from "@canto/ui/state-message";
import { Bookmark, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface MoveItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceListId: string;
  itemCount: number;
  onPick: (targetListId: string) => void;
  pending: boolean;
}

export function MoveItemsDialog({
  open,
  onOpenChange,
  sourceListId,
  itemCount,
  onPick,
  pending,
}: MoveItemsDialogProps): React.JSX.Element {
  const { data: lists, isLoading } = trpc.list.getAll.useQuery(undefined, {
    enabled: open,
  });

  const targets = useMemo(
    () =>
      (lists ?? []).filter(
        (l) =>
          l.id !== sourceListId &&
          (l.type === "custom" || l.type === "watchlist"),
      ),
    [lists, sourceListId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {itemCount} items</DialogTitle>
          <DialogDescription>
            Pick a destination collection. Items already in the destination are
            skipped.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : targets.length === 0 ? (
          <div className="py-6">
            <StateMessage preset="emptyCollections" minHeight="160px" />
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => onPick(target.id)}
                disabled={pending}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/40 disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <Bookmark className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {target.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {target.itemCount}{" "}
                    {target.itemCount === 1 ? "item" : "items"}
                    {target.type === "watchlist" && " · Watchlist"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Button } from "@canto/ui/button";
import { ArrowRightLeft, Loader2, Trash2, X } from "lucide-react";

interface SelectionBarProps {
  count: number;
  onCancel: () => void;
  onRemove: () => void;
  onMove: () => void;
  removePending: boolean;
  movePending: boolean;
  disableMove?: boolean;
  disableRemove?: boolean;
}

export function SelectionBar({
  count,
  onCancel,
  onRemove,
  onMove,
  removePending,
  movePending,
  disableMove,
  disableRemove,
}: SelectionBarProps): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={onCancel}
        >
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
        <span className="px-2 text-sm font-medium tabular-nums">
          {count} selected
        </span>
        <div className="h-6 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={onMove}
          disabled={count === 0 || movePending || disableMove}
        >
          {movePending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="mr-1.5 h-4 w-4" />
          )}
          Move to…
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-red-400 hover:text-red-500"
          onClick={onRemove}
          disabled={count === 0 || removePending || disableRemove}
        >
          {removePending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-1.5 h-4 w-4" />
          )}
          Remove
        </Button>
      </div>
    </div>
  );
}

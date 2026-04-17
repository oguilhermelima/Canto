"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import type { UseWatchedToggleResult } from "./use-watched-toggle";
import { formatHistoryDate, sourceLabel } from "./utils";

interface HistoryPanelProps {
  toggle: UseWatchedToggleResult;
}

export function HistoryPanel({ toggle }: HistoryPanelProps): React.JSX.Element {
  const {
    historyQuery,
    historyGroups,
    selectedHistoryEntryIds,
    toggleHistoryEntry,
    removeSelectedHistory,
    pending,
    setOpen,
  } = toggle;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-4">
        <div className="space-y-3">
          {historyQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-xl bg-accent"
                />
              ))}
            </div>
          ) : historyGroups.length === 0 ? (
            <div className="rounded-xl bg-accent px-3 py-4 text-sm text-muted-foreground">
              No watch history yet for this title.
            </div>
          ) : (
            <div className="space-y-2">
              {historyGroups.map((group) => (
                <details
                  key={group.key}
                  className="group overflow-hidden rounded-xl border border-border bg-muted/20"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                    <span className="text-sm font-medium">{group.title}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{group.items.length}</span>
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="border-t border-border">
                    {group.items.map((item) => {
                      const selected = selectedHistoryEntryIds.includes(
                        item.entry.id,
                      );
                      return (
                        <button
                          key={item.entry.id}
                          type="button"
                          onClick={() => toggleHistoryEntry(item.entry.id)}
                          className={cn(
                            "flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/70",
                            selected && "bg-primary/10",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground",
                            )}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.label}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatHistoryDate(item.entry.watchedAt)} ·{" "}
                              {sourceLabel(item.entry.source)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-5 py-3 md:px-6">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Close
          </Button>
          <Button
            variant="destructive"
            className="rounded-xl"
            onClick={removeSelectedHistory}
            disabled={pending || selectedHistoryEntryIds.length === 0}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Remove from watch history${selectedHistoryEntryIds.length > 0 ? ` (${selectedHistoryEntryIds.length})` : ""}`
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

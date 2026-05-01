"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Folder,
  Loader2,
  Plus,
  SatelliteDish,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { trpc } from "@/lib/trpc/client";

interface AddFromQbittorrentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddFromQbittorrentDialog({
  open,
  onOpenChange,
  onCreated,
}: AddFromQbittorrentDialogProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: qbitData, isLoading: qbitLoading } =
    trpc.folder.qbitCategories.useQuery(undefined, { enabled: open });
  const { data: folders } = trpc.folder.list.useQuery(undefined, {
    enabled: open,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const importedKeys = useMemo(
    () =>
      new Set(
        (folders ?? [])
          .map((f) => f.qbitCategory?.toLowerCase())
          .filter((v): v is string => Boolean(v)),
      ),
    [folders],
  );

  const rows = useMemo(() => {
    if (!qbitData)
      return [] as { name: string; savePath: string; imported: boolean }[];
    return Object.entries(qbitData.categories).map(([name, cat]) => ({
      name,
      savePath: cat.savePath || "",
      imported: importedKeys.has(name.toLowerCase()),
    }));
  }, [qbitData, importedKeys]);

  const selectableRows = useMemo(
    () => rows.filter((r) => !r.imported),
    [rows],
  );
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.name));

  // React docs: adjust state during render rather than syncing in an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setSelected(new Set());
  }

  const toggle = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected(
      allSelected ? new Set() : new Set(selectableRows.map((r) => r.name)),
    );
  };

  const createFolder = trpc.folder.create.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = async (): Promise<void> => {
    if (!qbitData || selected.size === 0) return;
    const defaultPath = qbitData.defaultSavePath.replace(/\/+$/, "");
    let imported = 0;
    for (const name of selected) {
      const cat = qbitData.categories[name];
      if (!cat) continue;
      const dlPath =
        cat.savePath || (defaultPath ? `${defaultPath}/${name}` : undefined);
      try {
        await createFolder.mutateAsync({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          downloadPath: dlPath,
          qbitCategory: name,
          priority: 10,
        });
        imported++;
      } catch {
        // toast already fired by mutation onError
      }
    }
    if (imported > 0) {
      toast.success(`Added ${imported} folder${imported > 1 ? "s" : ""}`);
      void utils.folder.list.invalidate();
      onCreated();
      onOpenChange(false);
    }
  };

  const isPending = createFolder.isPending;
  const empty = !qbitLoading && rows.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add from qBittorrent</DialogTitle>
        </DialogHeader>

        {qbitLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : empty ? (
          <div className="py-6 text-center space-y-1">
            <SatelliteDish className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No signals from qBittorrent
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Create a category in qBittorrent first — Canto can&apos;t
              bootstrap remote paths.
            </p>
          </div>
        ) : (
          <QbitRowList
            rows={rows}
            selected={selected}
            allSelected={allSelected}
            selectableCount={selectableRows.length}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={selected.size === 0 || isPending || empty}
            onClick={() => void handleSubmit()}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add{" "}
            {selected.size > 0
              ? `${selected.size} folder${selected.size > 1 ? "s" : ""}`
              : "selected"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row list                                                                   */
/* -------------------------------------------------------------------------- */

interface QbitRow {
  name: string;
  savePath: string;
  imported: boolean;
}

interface QbitRowListProps {
  rows: QbitRow[];
  selected: Set<string>;
  allSelected: boolean;
  selectableCount: number;
  onToggle: (name: string) => void;
  onToggleAll: () => void;
}

function QbitRowList({
  rows,
  selected,
  allSelected,
  selectableCount,
  onToggle,
  onToggleAll,
}: QbitRowListProps): React.JSX.Element {
  return (
    <div className="space-y-3 pt-1">
      <button
        type="button"
        onClick={onToggleAll}
        disabled={selectableCount === 0}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-left rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            allSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border",
          )}
        >
          {allSelected && <Check className="h-3 w-3" />}
        </div>
        <span className="font-medium text-foreground">
          {allSelected ? "Deselect all" : "Select all"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {selected.size}/{selectableCount}
        </span>
      </button>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="max-h-[320px] overflow-y-auto">
          {rows.map((row) => (
            <QbitRowItem
              key={row.name}
              row={row}
              selected={selected.has(row.name)}
              onToggle={() => onToggle(row.name)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface QbitRowItemProps {
  row: QbitRow;
  selected: boolean;
  onToggle: () => void;
}

function QbitRowItem({
  row,
  selected,
  onToggle,
}: QbitRowItemProps): React.JSX.Element {
  const disabled = row.imported;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left border-b border-border last:border-0 transition-colors min-w-0",
        disabled
          ? "text-muted-foreground cursor-not-allowed bg-muted/20"
          : selected
            ? "bg-primary/5 text-foreground"
            : "text-foreground hover:bg-accent",
      )}
    >
      <div
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          disabled
            ? "border-border bg-muted"
            : selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border",
        )}
      >
        {(selected || disabled) && <Check className="h-3 w-3" />}
      </div>
      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{row.name}</span>
        {row.savePath && (
          <span className="truncate text-xs text-muted-foreground font-mono">
            {row.savePath}
          </span>
        )}
      </div>
      {disabled && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Added
        </Badge>
      )}
    </button>
  );
}

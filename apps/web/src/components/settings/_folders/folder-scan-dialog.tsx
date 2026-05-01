"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  CornerLeftUp,
  Folder,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { PathInput } from "./folder-path-input";

interface ScanFoldersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  pathType: "download" | "library";
}

export function ScanFoldersDialog({
  open,
  onOpenChange,
  onCreated,
  pathType,
}: ScanFoldersDialogProps): React.JSX.Element {
  const [scanPath, setScanPath] = useState("/");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, isLoading } = trpc.folder.browse.useQuery(
    { path: scanPath },
    { enabled: open },
  );

  const createFolder = trpc.folder.create.useMutation({
    onSuccess: () => void onCreated(),
    onError: (err) => toast.error(err.message),
  });

  // React docs: adjust state during render rather than syncing in an effect.
  const stateKey = `${String(open)}|${scanPath}`;
  const [prevStateKey, setPrevStateKey] = useState(stateKey);
  if (prevStateKey !== stateKey) {
    setPrevStateKey(stateKey);
    if (open) setSelected(new Set());
  }

  const toggle = (path: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleImport = (): void => {
    for (const dirPath of selected) {
      const name = dirPath.split("/").pop() ?? "Unnamed";
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      createFolder.mutate({
        name,
        downloadPath: pathType === "download" ? dirPath : undefined,
        libraryPath: pathType === "library" ? dirPath : undefined,
        qbitCategory: slug,
        priority: 10,
      });
    }
    toast.success(
      `Importing ${selected.size} folder${selected.size > 1 ? "s" : ""}`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Import {pathType === "download" ? "download" : "storage"} folders
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Browse to a directory and select folders to import. Each selected
          folder becomes a new library with its path set as the{" "}
          {pathType === "download" ? "download" : "storage"} path.
        </p>

        <div className="space-y-3 pt-2">
          {/* Path browser */}
          <PathInput
            value={scanPath}
            onChange={setScanPath}
            placeholder="/"
            className="h-10 bg-accent rounded-xl border-none text-sm"
          />

          {/* Folder list with checkboxes */}
          <div className="rounded-xl border border-border overflow-hidden">
            {data?.parent && data.parent !== data.path && (
              <button
                type="button"
                onClick={() => setScanPath(data.parent)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors border-b border-border"
              >
                <CornerLeftUp className="h-4 w-4 shrink-0" />
                ..
              </button>
            )}
            <div className="max-h-[280px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : data?.dirs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No subfolders found
                </p>
              ) : (
                data?.dirs.map((dir) => {
                  const isSelected = selected.has(dir.path);
                  return (
                    <div
                      key={dir.path}
                      className="flex items-center border-b border-border last:border-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(dir.path)}
                        className={cn(
                          "flex flex-1 items-center gap-3 px-3 py-2.5 text-sm transition-colors min-w-0",
                          isSelected
                            ? "bg-primary/5 text-foreground"
                            : "text-foreground hover:bg-accent",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{dir.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScanPath(dir.path)}
                        className="shrink-0 px-3 py-2.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <Button
            className="w-full rounded-xl"
            disabled={selected.size === 0 || createFolder.isPending}
            onClick={handleImport}
          >
            {createFolder.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Import{" "}
            {selected.size > 0
              ? `${selected.size} folder${selected.size > 1 ? "s" : ""}`
              : "selected folders"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

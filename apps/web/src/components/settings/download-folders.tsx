"use client";

import { useCallback, useState } from "react";
import {
  Check,
  FolderOpen,
  Loader2,
  Plus,
  ScanSearch,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { CustomFolderDialog } from "./_folders/folder-create-dialog";
import { PathInput } from "./_folders/folder-path-input";
import { AddFromQbittorrentDialog } from "./_folders/folder-qbit-import-dialog";
import type { QbitPathOption } from "./_folders/folder-qbit-path";
import { FolderCard } from "./_folders/folder-row";
import { ScanFoldersDialog } from "./_folders/folder-scan-dialog";

interface DownloadFoldersProps {
  mode?: "settings" | "onboarding";
  onComplete?: () => void;
  /** Import method — controls whether cards show 1 or 2 paths */
  importMethod?: "local" | "remote";
}

function categoryToSubfolder(cat: string | null): string {
  return (cat ?? "default").toLowerCase();
}

export function DownloadFolders({
  mode = "settings",
  importMethod: importMethodProp,
}: DownloadFoldersProps): React.JSX.Element {
  // Resolve import method: prop (onboarding) or fetch from settings
  const { data: dlSettings } = trpc.library.getDownloadSettings.useQuery(
    undefined,
    { enabled: !importMethodProp },
  );
  const effectiveMethod =
    importMethodProp ??
    (dlSettings?.importMethod as "local" | "remote" | undefined) ??
    "local";
  const utils = trpc.useUtils();

  const [basePath, setBasePath] = useState("/data");
  // eslint-disable-next-line prefer-const -- kept as toggle for future use
  let showBasePath = false;
  const [customOpen, setCustomOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPathType, setScanPathType] = useState<"download" | "library">(
    "library",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addQbitOpen, setAddQbitOpen] = useState(false);

  const { data: folders, isLoading } = trpc.folder.list.useQuery();
  const { data: qbitData } = trpc.folder.qbitCategories.useQuery(undefined, {
    enabled: effectiveMethod === "remote",
  });
  const seedFolders = trpc.folder.seed.useMutation({
    onSuccess: () => {
      toast.success("Default folders created");
      void utils.folder.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateFolder = trpc.folder.update.useMutation({
    onSuccess: () => void utils.folder.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const testPaths = trpc.folder.testPaths.useMutation({
    onSuccess: (results) => {
      const allOk = results.every(
        (r) => r.downloadPath.ok && r.libraryPath.ok,
      );
      if (allOk) toast.success("All paths are accessible and writable");
      else {
        const issues = results
          .flatMap((r) => [
            !r.downloadPath.ok
              ? `${r.name} download: ${r.downloadPath.error}`
              : null,
            !r.libraryPath.ok
              ? `${r.name} library: ${r.libraryPath.error}`
              : null,
          ])
          .filter(Boolean);
        toast.error(`Path issues: ${issues.join("; ")}`);
      }
    },
    onError: () => toast.error("Failed to test paths"),
  });

  const refresh = useCallback(() => {
    void utils.folder.list.invalidate();
  }, [utils]);

  const allFolders = folders ?? [];

  // Build qBittorrent category options for the dropdown (remote mode).
  // Only include categories with a non-empty savePath — paths without one
  // cannot be validated and would lead to the same bug this dropdown fixes.
  const qbitOptions: QbitPathOption[] = (() => {
    if (!qbitData) return [];
    const out: QbitPathOption[] = [];
    const seen = new Set<string>();
    for (const [catName, cat] of Object.entries(qbitData.categories)) {
      if (!cat.savePath) continue;
      const key = `${catName}:${cat.savePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ category: catName, savePath: cat.savePath });
    }
    return out;
  })();

  const handleGeneratePaths = (): void => {
    const root = basePath.replace(/\/+$/, "");
    if (!root) return;
    let count = 0;
    for (const folder of allFolders) {
      const sub = categoryToSubfolder(folder.qbitCategory);
      const dl = `${root}/downloads/${sub}`;
      const lib = `${root}/media/${sub}`;
      if (folder.downloadPath !== dl || folder.libraryPath !== lib) {
        updateFolder.mutate({
          id: folder.id,
          downloadPath: dl,
          libraryPath: lib,
        });
        count++;
      }
    }
    if (count > 0)
      toast.success(`Paths generated for ${count} folder${count > 1 ? "s" : ""}`);
    else toast.info("All paths already match");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const isEmpty = allFolders.length === 0 && !seedFolders.isPending;

  return (
    <div className="space-y-4">
      {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- toggle for future use */}
      {showBasePath && (
        <BasePathPanel
          basePath={basePath}
          onBasePathChange={setBasePath}
          mode={mode}
          isEmpty={isEmpty}
          onGeneratePaths={handleGeneratePaths}
          isGenerating={updateFolder.isPending}
          onTestPaths={() => testPaths.mutate()}
          isTestingPaths={testPaths.isPending}
        />
      )}

      <FolderActionBar
        method={effectiveMethod}
        onScan={() => {
          setScanPathType("library");
          setScanOpen(true);
        }}
        onCustom={() => setCustomOpen(true)}
        onSeed={() => seedFolders.mutate()}
        isSeeding={seedFolders.isPending}
        onAddQbit={() => setAddQbitOpen(true)}
      />

      {!isEmpty && (
        <div className="space-y-3">
          {allFolders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              expanded={expandedId === folder.id}
              onToggle={() =>
                setExpandedId(expandedId === folder.id ? null : folder.id)
              }
              onRefresh={refresh}
              importMethod={effectiveMethod}
              qbitOptions={qbitOptions}
            />
          ))}
        </div>
      )}

      <CustomFolderDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onCreated={refresh}
        basePath={basePath}
        importMethod={effectiveMethod}
      />
      <ScanFoldersDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onCreated={refresh}
        pathType={scanPathType}
      />
      <AddFromQbittorrentDialog
        open={addQbitOpen}
        onOpenChange={setAddQbitOpen}
        onCreated={refresh}
      />
    </div>
  );
}

interface BasePathPanelProps {
  basePath: string;
  onBasePathChange: (value: string) => void;
  mode: "settings" | "onboarding";
  isEmpty: boolean;
  onGeneratePaths: () => void;
  isGenerating: boolean;
  onTestPaths: () => void;
  isTestingPaths: boolean;
}

function BasePathPanel({
  basePath,
  onBasePathChange,
  mode,
  isEmpty,
  onGeneratePaths,
  isGenerating,
  onTestPaths,
  isTestingPaths,
}: BasePathPanelProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-muted/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-primary" />
        <p className="text-sm font-semibold text-foreground">Base path</p>
        {!isEmpty && (
          <span className="text-sm text-muted-foreground">
            — generates{" "}
            <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded-md">
              /downloads/
            </code>{" "}
            and{" "}
            <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded-md">
              /media/
            </code>{" "}
            subfolders
          </span>
        )}
      </div>
      {isEmpty ? (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Where Canto stores everything. Download and library subfolders are
            generated per category.
          </p>
          <PathInput
            value={basePath}
            onChange={onBasePathChange}
            placeholder="/data"
            className="h-10 bg-accent rounded-xl border-none text-sm"
          />
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <PathInput
              value={basePath}
              onChange={onBasePathChange}
              placeholder="/data"
              className="h-10 bg-accent rounded-xl border-none text-sm"
            />
          </div>
          <Button
            className="h-10 rounded-xl gap-2"
            onClick={onGeneratePaths}
            disabled={!basePath || isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Generate paths
          </Button>
          {mode === "settings" && (
            <Button
              variant="outline"
              className="h-10 rounded-xl gap-2"
              onClick={onTestPaths}
              disabled={isTestingPaths}
            >
              {isTestingPaths ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Test paths
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface FolderActionBarProps {
  method: "local" | "remote";
  onScan: () => void;
  onCustom: () => void;
  onSeed: () => void;
  isSeeding: boolean;
  onAddQbit: () => void;
}

function FolderActionBar({
  method,
  onScan,
  onCustom,
  onSeed,
  isSeeding,
  onAddQbit,
}: FolderActionBarProps): React.JSX.Element {
  if (method === "remote") {
    return (
      <button
        type="button"
        onClick={onAddQbit}
        className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/[0.03] px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Add from qBittorrent
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="rounded-xl gap-2" onClick={onScan}>
        <ScanSearch className="h-4 w-4" />
        Import from filesystem
      </Button>
      <Button variant="outline" className="rounded-xl gap-2" onClick={onCustom}>
        <Plus className="h-4 w-4" />
        Custom library
      </Button>
      <Button
        variant="outline"
        className="rounded-xl gap-2"
        onClick={onSeed}
        disabled={isSeeding}
      >
        {isSeeding ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        Create suggested libraries
      </Button>
    </div>
  );
}

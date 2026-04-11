"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import { Save, Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { SettingsSection } from "~/components/settings/shared";

export function AutoMergeSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: autoMergeVersions } = trpc.library.getAutoMergeVersions.useQuery(undefined, { retry: false });
  const setAutoMerge = trpc.library.setAutoMergeVersions.useMutation({
    onSuccess: () => { void utils.library.getAutoMergeVersions.invalidate(); },
  });

  return (
    <SettingsSection title="Post-import" description="Automatic actions after media files are imported.">
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Auto-merge versions</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            When you download a second quality version, the media server will automatically merge them.
          </p>
        </div>
        <Switch checked={autoMergeVersions === true} onCheckedChange={(checked) => setAutoMerge.mutate(checked)} />
      </div>
    </SettingsSection>
  );
}

export function ImportMethodSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const dlSettingsQuery = trpc.library.getDownloadSettings.useQuery();
  const [importMethod, setImportMethod] = useState<"local" | "remote">("local");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dlSettingsQuery.data && !dirty) {
      setImportMethod(dlSettingsQuery.data.importMethod);
    }
  }, [dlSettingsQuery.data, dirty]);

  const setDlSettings = trpc.library.setDownloadSettings.useMutation({
    onSuccess: () => {
      toast.success("Transfer mode saved");
      setDirty(false);
      void utils.library.getDownloadSettings.invalidate();
    },
    onError: () => toast.error("Failed to save"),
  });

  const handleSave = (): void => {
    setDlSettings.mutate({
      importMethod,
      seedRatioLimit: dlSettingsQuery.data?.seedRatioLimit ?? null,
      seedTimeLimitHours: dlSettingsQuery.data?.seedTimeLimitHours ?? null,
      seedCleanupFiles: dlSettingsQuery.data?.seedCleanupFiles ?? false,
    });
  };

  return (
    <SettingsSection
      title="Transfer Mode"
      description="How completed downloads are moved from the download path to the storage path."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setImportMethod("local"); setDirty(true); }}
            className={cn(
              "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all",
              importMethod === "local"
                ? "border-primary/50 bg-primary/5"
                : "border-border/40 bg-muted/20 hover:bg-muted/40",
            )}
          >
            <span className="text-sm font-semibold">Hardlink (local)</span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Canto and qBittorrent share the same filesystem. Files are hardlinked to the storage path — zero extra disk space, and seeding continues uninterrupted.
            </p>
          </button>
          <button
            type="button"
            onClick={() => { setImportMethod("remote"); setDirty(true); }}
            className={cn(
              "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all",
              importMethod === "remote"
                ? "border-primary/50 bg-primary/5"
                : "border-border/40 bg-muted/20 hover:bg-muted/40",
            )}
          >
            <span className="text-sm font-semibold">qBittorrent API (remote)</span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              qBittorrent runs on a different machine. Canto tells qBittorrent to move files to the storage path via its API. No shared filesystem needed.
            </p>
          </button>
        </div>
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => { setImportMethod(dlSettingsQuery.data?.importMethod ?? "local"); setDirty(false); }} className="rounded-xl">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={setDlSettings.isPending} className="rounded-xl gap-2">
              {setDlSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

export function SeedingSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const dlSettingsQuery = trpc.library.getDownloadSettings.useQuery();
  const [seedRatio, setSeedRatio] = useState<string>("");
  const [seedTime, setSeedTime] = useState<string>("");
  const [seedCleanup, setSeedCleanup] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dlSettingsQuery.data && !dirty) {
      setSeedRatio(dlSettingsQuery.data.seedRatioLimit?.toString() ?? "");
      setSeedTime(dlSettingsQuery.data.seedTimeLimitHours?.toString() ?? "");
      setSeedCleanup(dlSettingsQuery.data.seedCleanupFiles);
    }
  }, [dlSettingsQuery.data, dirty]);

  const setDlSettings = trpc.library.setDownloadSettings.useMutation({
    onSuccess: () => {
      toast.success("Seeding settings saved");
      setDirty(false);
      void utils.library.getDownloadSettings.invalidate();
    },
    onError: () => toast.error("Failed to save"),
  });

  const handleSave = (): void => {
    setDlSettings.mutate({
      importMethod: dlSettingsQuery.data?.importMethod ?? "local",
      seedRatioLimit: seedRatio ? parseFloat(seedRatio) : null,
      seedTimeLimitHours: seedTime ? parseFloat(seedTime) : null,
      seedCleanupFiles: seedCleanup,
    });
  };

  return (
    <SettingsSection
      title="Seeding"
      description="When to stop seeding and whether to clean up download files afterward."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground/80">Ratio limit</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={seedRatio}
              onChange={(e) => { setSeedRatio(e.target.value); setDirty(true); }}
              placeholder="No limit"
              className="h-10 bg-accent rounded-xl border-none text-sm"
            />
            <p className="text-xs text-muted-foreground">Stop seeding after reaching this upload ratio.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground/80">Time limit (hours)</label>
            <Input
              type="number"
              step="1"
              min="0"
              value={seedTime}
              onChange={(e) => { setSeedTime(e.target.value); setDirty(true); }}
              placeholder="No limit"
              className="h-10 bg-accent rounded-xl border-none text-sm"
            />
            <p className="text-xs text-muted-foreground">Stop seeding after this many hours.</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Clean up after seeding</p>
            <p className="text-xs text-muted-foreground">
              Delete download files after seed limits are met. Safe with hardlinks — library copies stay intact.
            </p>
          </div>
          <Switch checked={seedCleanup} onCheckedChange={(v) => { setSeedCleanup(v); setDirty(true); }} />
        </div>

        {dirty && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setSeedRatio(dlSettingsQuery.data?.seedRatioLimit?.toString() ?? "");
              setSeedTime(dlSettingsQuery.data?.seedTimeLimitHours?.toString() ?? "");
              setSeedCleanup(dlSettingsQuery.data?.seedCleanupFiles ?? false);
              setDirty(false);
            }} className="rounded-xl">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={setDlSettings.isPending} className="rounded-xl gap-2">
              {setDlSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}


"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import {
  Globe,
  Library,
  Monitor,
  Sun,
  Moon,
  Info,
  Save,
  Check,
  ExternalLink,
  Loader2,
  Server,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const LIBRARY_TYPE_LABELS: Record<string, string> = {
  movies: "Movies",
  shows: "Shows",
  animes: "Animes",
};

export default function SettingsPage(): React.JSX.Element {
  const { region, setRegion } = useWatchRegion();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.title = "Settings — Canto";
  }, []);

  const displayRegion = pendingRegion ?? region;

  const { data: regions, isLoading: regionsLoading } =
    trpc.provider.regions.useQuery();

  const { data: watchProviders, isLoading: providersLoading } =
    trpc.provider.watchProviders.useQuery(
      { type: "movie", region: displayRegion },
      { enabled: !!displayRegion },
    );

  const handleSaveRegion = (): void => {
    const value = pendingRegion ?? region;
    setRegion(value);
    setPendingRegion(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasPendingChange = pendingRegion !== null && pendingRegion !== region;

  // Library config
  const { data: libraries, isLoading: librariesLoading } =
    trpc.library.listLibraries.useQuery();

  const utils = trpc.useUtils();

  const seedLibraries = trpc.library.seed.useMutation({
    onSuccess: () => {
      void utils.library.listLibraries.invalidate();
    },
  });

  const setDefault = trpc.library.setDefault.useMutation({
    onSuccess: () => {
      void utils.library.listLibraries.invalidate();
    },
  });

  // Jellyfin integration
  const { data: jellyfinStatus, isLoading: jellyfinLoading } =
    trpc.jellyfin.testConnection.useQuery();

  const syncLibraries = trpc.jellyfin.syncLibraries.useMutation({
    onSuccess: () => {
      void utils.library.listLibraries.invalidate();
      void utils.jellyfin.testConnection.invalidate();
    },
  });

  const scanLibrary = trpc.jellyfin.scan.useMutation();

  // User preferences
  const { data: preferences } = trpc.library.getPreferences.useQuery(
    undefined,
    {
      retry: false,
    },
  );

  const setPreference = trpc.library.setPreference.useMutation({
    onSuccess: () => {
      void utils.library.getPreferences.invalidate();
    },
  });

  // Group libraries by type
  const librariesByType = (libraries ?? []).reduce<
    Record<string, typeof libraries>
  >((acc, lib) => {
    if (!lib) return acc;
    const key = lib.type;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(lib);
    return acc;
  }, {});

  const autoMergeVersions =
    (preferences as Record<string, unknown> | undefined)?.autoMergeVersions ??
    true;

  return (
    <div className="mx-auto w-full px-4 py-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Settings</h1>

      <div className="max-w-2xl space-y-8">
        {/* Jellyfin Integration */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Server className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                Jellyfin Integration
              </h2>
              <p className="text-sm text-muted-foreground">
                Connect to your Jellyfin server to sync libraries.
              </p>
            </div>
            {jellyfinLoading ? (
              <Skeleton className="h-6 w-24 rounded-full" />
            ) : jellyfinStatus?.connected ? (
              <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20">
                Disconnected
              </Badge>
            )}
          </div>

          {jellyfinLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          ) : jellyfinStatus?.connected ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Server</span>
                  <span className="font-medium text-foreground">
                    {jellyfinStatus.serverName}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium text-foreground">
                    {jellyfinStatus.version}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => syncLibraries.mutate()}
                  disabled={syncLibraries.isPending}
                >
                  {syncLibraries.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Libraries
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => scanLibrary.mutate()}
                  disabled={scanLibrary.isPending}
                >
                  {scanLibrary.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    "Scan Library"
                  )}
                </Button>
              </div>

              {syncLibraries.data && (
                <p className="text-xs text-muted-foreground">
                  Last sync: {syncLibraries.data.length} library(ies) processed
                  ({syncLibraries.data.filter((l) => l.action === "created").length} created,{" "}
                  {syncLibraries.data.filter((l) => l.action === "updated").length} updated)
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">
                {jellyfinStatus?.error ??
                  "Could not connect. Set JELLYFIN_URL and JELLYFIN_API_KEY in your environment."}
              </p>
            </div>
          )}
        </section>

        {/* Watch Region */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Watch Region
              </h2>
              <p className="text-sm text-muted-foreground">
                Set your region to see relevant streaming providers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {regionsLoading ? (
              <Skeleton className="h-9 w-[250px]" />
            ) : (
              <Select
                value={displayRegion}
                onValueChange={(value) => setPendingRegion(value)}
              >
                <SelectTrigger className="h-9 w-[250px] border-border text-sm">
                  <SelectValue placeholder="Select region..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {regions
                    ?.sort((a, b) =>
                      a.englishName.localeCompare(b.englishName),
                    )
                    .map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {r.englishName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              onClick={handleSaveRegion}
              disabled={!hasPendingChange && !saved}
            >
              {saved ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>

          {/* Preview streaming providers */}
          {displayRegion && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Available streaming services in your region
              </h3>
              {providersLoading ? (
                <div className="flex flex-wrap gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-12 rounded-lg" />
                  ))}
                </div>
              ) : watchProviders && watchProviders.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {watchProviders.slice(0, 30).map((p) => (
                    <div
                      key={p.providerId}
                      className="group relative"
                      title={p.providerName}
                    >
                      <img
                        src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`}
                        alt={p.providerName}
                        className="h-12 w-12 rounded-lg border border-border object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No streaming providers found for this region.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Theme */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Theme</h2>
              <p className="text-sm text-muted-foreground">
                Choose how Canto looks to you.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                  mounted && theme === value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Libraries */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Library className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                Libraries
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure download destinations and Jellyfin paths.
              </p>
            </div>
            {libraries && libraries.length === 0 && (
              <Button
                size="sm"
                onClick={() => seedLibraries.mutate()}
                disabled={seedLibraries.isPending}
              >
                {seedLibraries.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Seeding...
                  </>
                ) : (
                  "Create Defaults"
                )}
              </Button>
            )}
          </div>

          {librariesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : libraries && libraries.length > 0 ? (
            <div className="space-y-5">
              {(["movies", "shows", "animes"] as const).map((type) => {
                const libs = librariesByType[type];
                if (!libs || libs.length === 0) return null;

                return (
                  <div key={type}>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      {LIBRARY_TYPE_LABELS[type] ?? type}
                    </h3>
                    <div className="space-y-2">
                      {libs.map((lib) => (
                        <label
                          key={lib.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                            lib.isDefault
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-foreground/20",
                          )}
                        >
                          <input
                            type="radio"
                            name={`default-${type}`}
                            checked={lib.isDefault}
                            onChange={() => {
                              if (!lib.isDefault) {
                                setDefault.mutate({ id: lib.id });
                              }
                            }}
                            className="h-4 w-4 accent-primary"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {lib.name}
                              </span>
                              {"jellyfinLibraryId" in lib &&
                                lib.jellyfinLibraryId && (
                                  <Badge
                                    variant="secondary"
                                    className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] px-1.5 py-0"
                                  >
                                    Synced
                                  </Badge>
                                )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                              {lib.jellyfinPath && (
                                <span>Jellyfin: {lib.jellyfinPath}</span>
                              )}
                              {lib.qbitCategory && (
                                <span>Category: {lib.qbitCategory}</span>
                              )}
                            </div>
                          </div>
                          {lib.isDefault && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Default
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No libraries configured. Click &quot;Create Defaults&quot; to set
              up the standard libraries.
            </p>
          )}
        </section>

        {/* Download Preferences */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Download Preferences
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure how downloads are handled.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Auto-merge versions
                </p>
                <p className="text-xs text-muted-foreground">
                  Automatically merge multiple quality versions in Jellyfin
                  after import.
                </p>
              </div>
              <Switch
                checked={autoMergeVersions === true}
                onCheckedChange={(checked) =>
                  setPreference.mutate({
                    key: "autoMergeVersions",
                    value: checked,
                  })
                }
              />
            </div>
          </div>
        </section>

        {/* About */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Info className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">About</h2>
              <p className="text-sm text-muted-foreground">
                Application information and links.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium text-foreground">Canto</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium text-foreground">0.1.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Description</span>
              <span className="text-foreground">
                Your personal corner for media.
              </span>
            </div>
            <div className="my-3 h-px bg-border" />
            <div className="flex flex-wrap gap-2">
              <a
                href="https://github.com/oguilhermelima/canto"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                GitHub
              </a>
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                TMDB
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

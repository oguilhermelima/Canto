"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Save, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useWatchRegion } from "@/hooks/use-watch-region";
import { useDirectSearch } from "@/hooks/use-direct-search";
import { SettingsSection } from "@/components/settings/shared";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function PreferencesSection(): React.JSX.Element {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: _allSettings } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });

  /* Language */
  const { data: currentLanguage } = trpc.settings.getUserLanguage.useQuery();
  const { data: supportedLanguages } = trpc.settings.getSupportedLanguages.useQuery();
  const setUserLanguage = trpc.settings.setUserLanguage.useMutation();

  const handleLanguageChange = (value: string): void => {
    setUserLanguage.mutate(
      { language: value },
      {
        onSuccess: () => {
          setMany.mutate({ settings: [{ key: "general.language", value }] });
          toast.success("Language updated. Items will translate as you visit them.");
          // Almost every server-driven view (spotlight, recs, library, watch
          // next, profile, lists, search …) reads from the per-request
          // language overlay, so a precise invalidation list rots the moment
          // a new language-aware endpoint ships. Nuke React Query and refresh
          // server components — language change is rare enough that the cost
          // is negligible vs the maintenance hazard of a partial list.
          void utils.invalidate();
          router.refresh();
        },
        onError: () => toast.error("Failed to update language"),
      },
    );
  };

  /* Watch region */
  const { region, setRegion } = useWatchRegion();
  const [regionSaved, setRegionSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const regionTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const displayRegion = pendingRegion ?? region;

  useEffect(() => {
    return () => { if (regionTimerRef.current) clearTimeout(regionTimerRef.current); };
  }, []);

  const { data: regionsRaw, isLoading: regionsLoading } = trpc.provider.filterOptions.useQuery({ type: "regions" });
  const regions = regionsRaw as Array<{ code: string; englishName: string; nativeName: string }> | undefined;
  const { data: wpRaw, isLoading: providersLoading } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: "movie", region: displayRegion },
    { enabled: !!displayRegion },
  );
  const watchProviders = wpRaw as
    | Array<{ providerId: number; providerName: string; logoPath: string; displayPriority: number }>
    | undefined;

  const handleSaveRegion = (): void => {
    setRegion(pendingRegion ?? region);
    setPendingRegion(null);
    setRegionSaved(true);
    if (regionTimerRef.current) clearTimeout(regionTimerRef.current);
    regionTimerRef.current = setTimeout(() => setRegionSaved(false), 2000);
  };
  const hasRegionChange = pendingRegion !== null && pendingRegion !== region;

  /* Direct search */
  const { enabled: directSearchEnabled, setEnabled: setDirectSearch } = useDirectSearch();

  /* Watch state reconciliation */
  const reconcileMutation = trpc.userMedia.reconcileStatesFromPlayback.useMutation({
    onSuccess: (data) => {
      toast.success(`Reconciled ${data.promoted} of ${data.scanned} items`);
      void utils.userMedia.getUserMediaCounts.invalidate();
      void utils.userMedia.getLibraryStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <SettingsSection title="Content & Region" description="Language, streaming region, and playback behavior.">
      <div className="space-y-8">
        {/* Language */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Language</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Language used for metadata, titles, descriptions, and trailers.
            </p>
          </div>
          <Select value={currentLanguage ?? "en-US"} onValueChange={handleLanguageChange}>
            <SelectTrigger className="h-10 w-60 rounded-xl border-none bg-accent text-sm focus:ring-1 focus:ring-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(supportedLanguages ?? []).map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="h-px bg-border/40" />

        {/* Watch region */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground">Watch Region</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Determines which streaming providers appear on media pages.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {regionsLoading ? (
              <Skeleton className="h-10 w-60" />
            ) : (
              <Select value={displayRegion} onValueChange={(v) => setPendingRegion(v)}>
                <SelectTrigger className="h-10 w-60 rounded-xl border-none bg-accent text-sm focus:ring-1 focus:ring-border">
                  <SelectValue placeholder="Select region..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {regions
                    ?.sort((a, b) => a.englishName.localeCompare(b.englishName))
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
              className="rounded-xl"
              onClick={handleSaveRegion}
              disabled={!hasRegionChange && !regionSaved}
            >
              {regionSaved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {regionSaved ? "Saved" : "Save"}
            </Button>
          </div>

          {displayRegion && (
            <div>
              <p className="mb-3 text-xs text-muted-foreground">Available streaming services</p>
              {providersLoading ? (
                <div className="flex flex-wrap gap-2.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-11 rounded-xl" />
                  ))}
                </div>
              ) : watchProviders && watchProviders.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  {watchProviders.slice(0, 30).map((p) => (
                    <Image
                      key={p.providerId}
                      src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`}
                      alt={p.providerName}
                      title={p.providerName}
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-xl border border-border object-cover"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No providers found.</p>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-border/40" />

        {/* Direct search toggle */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-foreground">Direct Search on Streaming Apps</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              When enabled, clicking a streaming provider logo opens a direct search on that
              service. When disabled, it opens the TMDB watch page instead.
            </p>
          </div>
          <Switch
            checked={directSearchEnabled}
            onCheckedChange={setDirectSearch}
            className="mt-0.5 shrink-0"
          />
        </div>

        <div className="h-px bg-border/40" />

        {/* Watch state reconciliation */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-foreground">Reconcile Watch State</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Recomputes your watched status from Jellyfin/Plex playback data. Run this if your
              Completed count looks wrong or lags behind what you've actually watched.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
          >
            {reconcileMutation.isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {reconcileMutation.isPending ? "Reconciling..." : "Reconcile"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

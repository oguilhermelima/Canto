"use client";

import { useState, useEffect } from "react";
import { Globe } from "lucide-react";
import { Switch } from "@canto/ui/switch";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { trpc } from "@/lib/trpc/client";
import { useWatchRegion } from "@/hooks/use-watch-region";
import { useDirectSearch } from "@/hooks/use-direct-search";
import type { ConfigureFooter } from "../../_components/onboarding-footer";
import { StepHeader } from "../../_components/step-header";

export function ContentRegionStep({
  onNext,
  configureFooter,
}: {
  onNext: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: currentLanguage } = trpc.settings.getUserLanguage.useQuery();
  const { data: supportedLanguages } = trpc.settings.getSupportedLanguages.useQuery();
  const setUserLanguage = trpc.settings.setUserLanguage.useMutation({
    onSuccess: () => void utils.settings.getUserLanguage.invalidate(),
  });

  const { region, setRegion } = useWatchRegion();
  const { enabled: directSearchEnabled, setEnabled: setDirectSearch } = useDirectSearch();
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const displayRegion = pendingRegion ?? region;

  const { data: regionsRaw, isLoading: regionsLoading } = trpc.provider.filterOptions.useQuery({
    type: "regions",
  });
  const regions = regionsRaw as
    | Array<{ code: string; englishName: string; nativeName: string }>
    | undefined;

  const handleLanguage = (value: string): void => {
    setUserLanguage.mutate({ language: value });
  };

  const handleContinue = (): void => {
    if (pendingRegion && pendingRegion !== region) setRegion(pendingRegion);
    onNext();
  };

  useEffect(() => {
    configureFooter({
      onPrimary: handleContinue,
      primaryLabel: "Continue",
    });
  }, [pendingRegion, region, directSearchEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Globe className="h-8 w-8 text-primary" />
      </div>
      <StepHeader
        title="Content & Region"
        description="Set your language, watch region, and how streaming links behave. You can change all of this later from Settings."
      />

      <div className="w-full max-w-md space-y-6 text-left">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Language</label>
          <p className="text-xs text-muted-foreground">Used for metadata, titles, and descriptions.</p>
          <Select value={currentLanguage ?? "en-US"} onValueChange={handleLanguage}>
            <SelectTrigger className="h-10 rounded-xl border-none bg-accent text-sm focus:ring-1 focus:ring-border">
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Watch region</label>
          <p className="text-xs text-muted-foreground">Controls which streaming providers appear on media pages.</p>
          {regionsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={displayRegion} onValueChange={(v) => setPendingRegion(v)}>
              <SelectTrigger className="h-10 rounded-xl border-none bg-accent text-sm focus:ring-1 focus:ring-border">
                <SelectValue placeholder="Select region…" />
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
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl bg-accent/30 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Direct search on streaming apps</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Clicking a streaming logo opens a direct search on that service instead of the TMDB watch page.
            </p>
          </div>
          <Switch
            checked={directSearchEnabled}
            onCheckedChange={setDirectSearch}
            className="mt-0.5 shrink-0"
          />
        </div>
      </div>
    </div>
  );
}

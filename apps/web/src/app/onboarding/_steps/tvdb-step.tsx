"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@canto/ui/switch";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool } from "../_components/constants";
import Image from "next/image";
import { PasswordInput } from "@canto/ui/password-input";
import { StepHeader } from "../_components/step-header";

export function TvdbStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [apiKey, setApiKey] = useState(str(settings, "tvdb.apiKey"));
  const [defaultShows, setDefaultShows] = useState(bool(settings, "tvdb.defaultShows"));
  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();
  const testing = testService.isPending || setMany.isPending;

  const handleSave = async (): Promise<void> => {
    // Probe before persisting — the old version saved blindly and a typo only
    // surfaced later when a metadata job failed deep in the worker.
    try {
      const result = await testService.mutateAsync({
        service: "tvdb",
        values: { "tvdb.apiKey": apiKey },
      });
      if (!result.connected) {
        toast.error(`Invalid TVDB API key — ${"error" in result ? result.error : "connection failed"}`);
        return;
      }
      await setMany.mutateAsync({
        settings: [
          { key: "tvdb.apiKey", value: apiKey },
          { key: "tvdb.enabled", value: true },
          { key: "tvdb.defaultShows", value: defaultShows },
        ],
      });
      toast.success("TVDB connected");
      onNext();
    } catch {
      toast.error("Failed to save TVDB key");
    }
  };

  useEffect(() => {
    configureFooter({ onPrimary: () => void handleSave(), primaryDisabled: !apiKey || testing, primaryLoading: testing, onSkip: onNext });
  }, [apiKey, defaultShows, testing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <Image src="/tvdb.svg" alt="TVDB" width={48} height={48} className="shrink-0 dark:invert" />
      <StepHeader
        title="Episode Metadata"
        description="TMDB sometimes gets season and episode numbering wrong — especially for anime, specials, and shows with different regional airing orders. TVDB provides more accurate episode structures while Canto keeps using TMDB for everything else."
      />
      <p className="mx-auto max-w-2xl text-sm text-muted-foreground leading-relaxed">
        Recommended for anime and multi-season shows. Get a free key at{" "}
        <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          thetvdb.com
        </a>.
      </p>

      <div className="w-full max-w-md space-y-4">
        <PasswordInput
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TVDB API key"
          variant="ghost"
        />

        {apiKey && (
          <div className="flex items-center justify-between rounded-xl bg-accent/30 px-4 py-3 text-left">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Use TVDB for season/episode structure</p>
              <p className="text-sm text-muted-foreground">Validates and corrects episode numbering for TV shows and anime</p>
            </div>
            <Switch checked={defaultShows} onCheckedChange={setDefaultShows} />
          </div>
        )}
      </div>
    </div>
  );
}

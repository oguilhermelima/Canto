"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@canto/ui/switch";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool } from "../_components/constants";
import { PasswordInput } from "@canto/ui/password-input";
import { StepHeader } from "../_components/step-header";

export function TvdbStep({
  onNext,
  onBack,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  onBack: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [apiKey, setApiKey] = useState(str(settings, "tvdb.apiKey"));
  const [defaultShows, setDefaultShows] = useState(bool(settings, "tvdb.defaultShows"));
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => { toast.success("TVDB connected"); onNext(); },
    onError: () => toast.error("Failed to save TVDB key"),
  });

  const handleSave = (): void => {
    setMany.mutate({ settings: [
      { key: "tvdb.apiKey", value: apiKey },
      { key: "tvdb.enabled", value: true },
      { key: "tvdb.defaultShows", value: defaultShows },
    ] });
  };

  useEffect(() => {
    configureFooter({ onPrimary: handleSave, primaryDisabled: !apiKey, primaryLoading: setMany.isPending, onSkip: onNext });
  }, [apiKey, defaultShows, setMany.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <img src="/tvdb.svg" alt="TVDB" width={48} height={48} className="shrink-0 dark:invert" />
      <StepHeader
        title="Episode Metadata"
        description="TMDB sometimes gets season and episode numbering wrong — especially for anime, specials, and shows with different regional airing orders. TVDB provides more accurate episode structures while Canto keeps using TMDB for everything else."
        onBack={onBack}
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

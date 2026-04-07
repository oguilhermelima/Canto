"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, inputCn } from "../_components/constants";
import { PasswordInput } from "../_components/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

export function TmdbStep({
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
  const [apiKey, setApiKey] = useState(str(settings, "tmdb.apiKey"));
  const [testing, setTesting] = useState(false);

  const setSetting = trpc.settings.set.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    setTesting(true);
    try {
      await setSetting.mutateAsync({ key: "tmdb.apiKey", value: apiKey });
      const result = await testService.mutateAsync({
        service: "tmdb",
        values: { "tmdb.apiKey": apiKey },
      });
      if (result.connected) {
        toast.success("TMDB connected");
        onNext();
      } else {
        toast.error("Invalid API key. Check your TMDB key and try again.");
      }
    } catch {
      toast.error("Failed to validate TMDB key");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    configureFooter({ onPrimary: handleSave, primaryDisabled: !apiKey, primaryLoading: testing });
  }, [apiKey, testing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <ServiceLogo src="/tmdb.svg" alt="TMDB" />
      <StepHeader
        title="Metadata"
        description={
          <>
            Canto uses TMDB as its primary source for posters, synopses, ratings, and recommendations.
            You'll need a free API key — it takes less than a minute at{" "}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              themoviedb.org
            </a>.
          </>
        }
        onBack={onBack}
      />

      <div className="w-full max-w-md">
        <PasswordInput
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TMDB API key (v3 auth)"
          className={inputCn}
        />
      </div>
    </div>
  );
}

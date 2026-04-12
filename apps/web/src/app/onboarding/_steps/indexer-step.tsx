"use client";

import { useState, useEffect } from "react";
import { Input } from "@canto/ui/input";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { bool, str } from "../_components/constants";
import { PasswordInput } from "@canto/ui/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { AnimatedCollapse } from "../_components/animated-collapse";
import { StepHeader } from "../_components/step-header";

export function IndexerStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const hasProwlarr = bool(settings, "prowlarr.enabled");
  const hasJackett = bool(settings, "jackett.enabled");
  const defaultChoice = hasProwlarr ? "prowlarr" as const : hasJackett ? "jackett" as const : null;
  const [choice, setChoice] = useState<"prowlarr" | "jackett" | null>(defaultChoice);
  const [url, setUrl] = useState(defaultChoice ? str(settings, `${defaultChoice}.url`) : "");
  const [apiKey, setApiKey] = useState(defaultChoice ? str(settings, `${defaultChoice}.apiKey`) : "");
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    if (!choice) return;
    setTesting(true);
    try {
      const prefix = choice;
      const result = await testService.mutateAsync({
        service: choice,
        values: { [`${prefix}.url`]: url, [`${prefix}.apiKey`]: apiKey },
      });
      if (!result.connected) {
        toast.error("Connection failed. Check your URL and API key.");
        return;
      }
      await setMany.mutateAsync({
        settings: [
          { key: `${prefix}.url`, value: url },
          { key: `${prefix}.apiKey`, value: apiKey },
          { key: `${prefix}.enabled`, value: true },
        ],
      });
      toast.success(`${choice === "prowlarr" ? "Prowlarr" : "Jackett"} connected`);
      onNext();
    } catch {
      toast.error("Failed to connect");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    configureFooter({ onPrimary: () => void handleSave(), primaryLabel: "Connect & continue", primaryDisabled: !choice || !url || !apiKey, primaryLoading: testing, onSkip: onNext });
  }, [choice, url, apiKey, testing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex gap-3">
        <ServiceLogo src="/prowlarr.svg" alt="Prowlarr" size={36} />
        <ServiceLogo brand="jackett" alt="Jackett" size={36} />
      </div>
      <StepHeader
        title="Indexers"
        description={
          <>
            Canto needs to know <strong>where to search for downloads</strong>.
            Connect Prowlarr or Jackett to aggregate your torrent trackers — when you hit download, Canto searches all of them at once.
          </>
        }
      />

      <div className="flex w-full max-w-md gap-3">
        <button
          type="button"
          onClick={() => { setChoice(choice === "prowlarr" ? null : "prowlarr"); setUrl(""); setApiKey(""); }}
          className={cn(
            "flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 transition-all",
            choice === "prowlarr" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent/50",
          )}
        >
          <ServiceLogo src="/prowlarr.svg" alt="" size={32} />
          <span className="text-sm font-medium">Prowlarr</span>
        </button>
        <button
          type="button"
          onClick={() => { setChoice(choice === "jackett" ? null : "jackett"); setUrl(""); setApiKey(""); }}
          className={cn(
            "flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 transition-all",
            choice === "jackett" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent/50",
          )}
        >
          <ServiceLogo brand="jackett" alt="" size={32} />
          <span className="text-sm font-medium">Jackett</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <AnimatedCollapse open={choice !== null}>
          <div className="space-y-3 pt-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={`${choice === "prowlarr" ? "Prowlarr" : "Jackett"} URL (e.g. http://localhost:${choice === "prowlarr" ? "9696" : "9117"})`}
              variant="ghost"
            />
            <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" variant="ghost" />
          </div>
        </AnimatedCollapse>
      </div>
    </div>
  );
}

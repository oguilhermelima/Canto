"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import type { Step } from "./_components/constants";
import { LIBRARY_STEPS } from "./_components/constants";
import { FadeIn } from "./_components/fade-in";
import {
  OnboardingFooter,
  type FooterConfig,
} from "./_components/onboarding-footer";
import { WelcomeStep } from "./_steps/welcome-step";
import { OverviewStep } from "./_steps/overview-step";
import { TmdbStep } from "./_steps/tmdb-step";
import { TvdbStep } from "./_steps/tvdb-step";
import { IndexerStep } from "./_steps/indexer-step";
import { DownloadClientStep } from "./_steps/download-client-step";
import { LibrariesIntroStep } from "./_steps/libraries-intro-step";
import { LibrariesTransferStep } from "./_steps/libraries-transfer-step";
import { LibrariesConfigureStep } from "./_steps/libraries-configure-step";
import { JellyfinStep } from "./_steps/jellyfin-step";
import { PlexStep } from "./_steps/plex-step";
import { SyncingStep } from "./_steps/syncing-step";
import { ReadyStep } from "./_steps/ready-step";

/* -------------------------------------------------------------------------- */
/*  Step ordering                                                              */
/* -------------------------------------------------------------------------- */

function buildSteps(torrentConnected: boolean): Step[] {
  const steps: Step[] = [
    "welcome",
    "overview",
    "tmdb",
    "tvdb",
    "indexer",
    "download-client",
  ];
  if (torrentConnected) steps.push(...LIBRARY_STEPS);
  steps.push("jellyfin", "plex", "syncing", "ready");
  return steps;
}

/* -------------------------------------------------------------------------- */
/*  Main Onboarding Page                                                       */
/* -------------------------------------------------------------------------- */

export default function OnboardingPage(): React.JSX.Element {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [torrentConnected, setTorrentConnected] = useState(false);
  const [footerConfig, setFooterConfig] = useState<FooterConfig>({});

  const { data: isCompleted, isLoading } =
    trpc.settings.isOnboardingCompleted.useQuery();
  const { data: allSettings, isLoading: settingsLoading } =
    trpc.settings.getAll.useQuery();
  const completeOnboarding = trpc.settings.completeOnboarding.useMutation();

  // Detect if torrent client was already configured before onboarding
  useEffect(() => {
    if (allSettings && allSettings["qbittorrent.enabled"] === true) {
      setTorrentConnected(true);
    }
  }, [allSettings]);

  const steps = useMemo(() => buildSteps(torrentConnected), [torrentConnected]);
  const step = steps[currentStep]!;

  useEffect(() => {
    if (isCompleted === true) router.replace("/");
  }, [isCompleted, router]);

  // Reset footer config when step changes
  useEffect(() => {
    setFooterConfig({});
  }, [currentStep]);

  const next = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const skipTo = useCallback(
    (targetStep: Step) => {
      const idx = steps.indexOf(targetStep);
      if (idx >= 0) setCurrentStep(idx);
    },
    [steps],
  );

  const back = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const finish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    router.replace("/");
  }, [completeOnboarding, router]);

  const skipLibraries = useCallback(() => skipTo("jellyfin"), [skipTo]);

  if (isLoading || settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile top bar with back button */}
      {footerConfig.showBack !== false && currentStep > 0 && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center h-14 px-4 md:hidden">
          <button
            type="button"
            onClick={back}
            aria-label="Go back"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-[140px] md:pb-0">
        <div
          className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center py-12"
          style={{ minHeight: "calc(100dvh - 140px)" }}
        >
          {/* Desktop inline back button */}
          {footerConfig.showBack !== false && currentStep > 0 && (
            <div className="hidden md:flex w-full mb-8">
              <button
                type="button"
                onClick={back}
                aria-label="Go back"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          )}
          <FadeIn key={step}>
            {step === "welcome" && (
              <WelcomeStep onNext={next} configureFooter={setFooterConfig} />
            )}
            {step === "overview" && (
              <OverviewStep onNext={next} onBack={back} configureFooter={setFooterConfig} />
            )}
            {step === "tmdb" && (
              <TmdbStep
                onNext={next}
                onBack={back}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "tvdb" && (
              <TvdbStep
                onNext={next}
                onBack={back}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "indexer" && (
              <IndexerStep
                onNext={next}
                onBack={back}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "download-client" && (
              <DownloadClientStep
                onNext={() => {
                  setTorrentConnected(true);
                  next();
                }}
                onBack={back}
                onSkip={next}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "libraries-intro" && (
              <LibrariesIntroStep
                onNext={next}
                onBack={back}
                onSkip={skipLibraries}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "libraries-transfer" && (
              <LibrariesTransferStep
                onNext={next}
                onBack={back}
                onSkip={skipLibraries}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "libraries-configure" && (
              <LibrariesConfigureStep
                onNext={next}
                onBack={back}
                onSkip={skipLibraries}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "jellyfin" && (
              <JellyfinStep
                onNext={next}
                onBack={back}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "plex" && (
              <PlexStep
                onNext={next}
                onBack={back}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "syncing" && (
              <SyncingStep
                onNext={next}
                settings={allSettings}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "ready" && (
              <ReadyStep
                onFinish={finish}
                configureFooter={setFooterConfig}
              />
            )}
          </FadeIn>

          <OnboardingFooter
            currentStep={currentStep}
            totalSteps={steps.length}
            onBack={back}
            config={footerConfig}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { FadeIn } from "../_components/fade-in";
import {
  OnboardingFooter,
} from "../_components/onboarding-footer";
import type { FooterConfig } from "../_components/onboarding-footer";
import { WelcomeStep } from "./_steps/welcome-step";
import { ContentRegionStep } from "./_steps/content-region-step";
import { JellyfinUserStep } from "./_steps/jellyfin-step";
import { PlexUserStep } from "./_steps/plex-step";
import { TraktUserStep } from "./_steps/trakt-step";
import { ProfileStep } from "./_steps/profile-step";
import { ReadyStep } from "./_steps/ready-step";

type Step = "welcome" | "content-region" | "jellyfin" | "plex" | "trakt" | "profile" | "ready";

const PROGRESS_KEY = "canto.user-onboarding.step";

export default function UserOnboardingPage(): React.JSX.Element {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [footerConfig, setFooterConfig] = useState<FooterConfig>({});

  const { data: userOnboardingDone, isLoading: onboardingCheckLoading } =
    trpc.auth.isOnboardingCompleted.useQuery();
  const { data: providersReady, isLoading: providersLoading } =
    trpc.settings.getMediaProvidersReady.useQuery();
  const { data: connections, isLoading: connectionsLoading } =
    trpc.userConnection.list.useQuery();

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(PROGRESS_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed >= 0) setCurrentStep(parsed);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROGRESS_KEY, String(currentStep));
    }
  }, [currentStep]);

  useEffect(() => {
    if (userOnboardingDone === true) router.replace("/setup");
  }, [userOnboardingDone, router]);

  const steps = useMemo<Step[]>(() => {
    const list: Step[] = ["welcome", "content-region"];
    if (providersReady?.jellyfin) list.push("jellyfin");
    if (providersReady?.plex) list.push("plex");
    if (providersReady?.trakt) list.push("trakt");
    list.push("profile", "ready");
    return list;
  }, [providersReady]);

  // Clamp rehydrated index if providers changed between sessions — otherwise
  // the lookup returns undefined and FadeIn renders nothing.
  useEffect(() => {
    if (currentStep > steps.length - 1) setCurrentStep(steps.length - 1);
  }, [steps.length, currentStep]);

  const step = steps[Math.min(currentStep, steps.length - 1)] ?? "welcome";

  const jellyfinConnected = connections?.some((c) => c.provider === "jellyfin") ?? false;
  const plexConnected = connections?.some((c) => c.provider === "plex") ?? false;
  const traktConnected = connections?.some((c) => c.provider === "trakt") ?? false;

  const next = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const finish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PROGRESS_KEY);
    }
    router.replace("/setup");
  }, [completeOnboarding, router]);

  if (onboardingCheckLoading || providersLoading || connectionsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
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
            {step === "content-region" && (
              <ContentRegionStep onNext={next} configureFooter={setFooterConfig} />
            )}
            {step === "jellyfin" && (
              <JellyfinUserStep
                onNext={next}
                alreadyConnected={jellyfinConnected}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "plex" && (
              <PlexUserStep
                onNext={next}
                alreadyConnected={plexConnected}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "trakt" && (
              <TraktUserStep
                onNext={next}
                alreadyConnected={traktConnected}
                configureFooter={setFooterConfig}
              />
            )}
            {step === "profile" && (
              <ProfileStep onNext={next} configureFooter={setFooterConfig} />
            )}
            {step === "ready" && (
              <ReadyStep onFinish={finish} configureFooter={setFooterConfig} />
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

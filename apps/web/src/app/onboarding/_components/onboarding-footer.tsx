"use client";

import { Button } from "@canto/ui/button";
import { Loader2, ArrowRight } from "lucide-react";
import { StepDots } from "./step-dots";
import { btnCn } from "./constants";

export type FooterConfig = {
  /** Primary action handler. If undefined, primary button is hidden. */
  onPrimary?: () => void;
  /** Label for the primary button. Default: "Continue" */
  primaryLabel?: string;
  /** Icon to show on primary button. Default: ArrowRight */
  primaryIcon?: React.ReactNode;
  /** Disable the primary button */
  primaryDisabled?: boolean;
  /** Show loading spinner on primary button */
  primaryLoading?: boolean;
  /** Skip action handler. If undefined, skip button is hidden. */
  onSkip?: () => void;
  /** Label for skip button. Default: "Skip" */
  skipLabel?: string;
  /** Show back button (used by page.tsx for top-left back). Default: true */
  showBack?: boolean;
  /** Show step dots. Default: true */
  showDots?: boolean;
  /** Extra content below primary button (e.g. "Sign out" link) */
  secondaryAction?: React.ReactNode;
};

export type ConfigureFooter = (config: FooterConfig) => void;

export function OnboardingFooter({
  currentStep,
  totalSteps,
  config,
}: {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  config: FooterConfig;
}): React.JSX.Element {
  const {
    onPrimary,
    primaryLabel,
    primaryIcon,
    primaryDisabled = false,
    primaryLoading = false,
    onSkip,
    skipLabel,
    showDots = true,
    secondaryAction,
  } = config;

  return (
    <div className="mt-10 fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background md:static md:z-auto md:border-0 md:bg-transparent">
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
        {/* Actions */}
        {onPrimary && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-3">
              {onSkip && (
                <Button
                  onClick={onSkip}
                  variant="ghost"
                  size="lg"
                  className="rounded-xl text-muted-foreground"
                >
                  {skipLabel ?? "Skip"}
                </Button>
              )}
              <Button
                onClick={onPrimary}
                size="lg"
                className={btnCn}
                disabled={primaryDisabled || primaryLoading}
              >
                {primaryLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  primaryIcon
                )}
                {primaryLabel ?? "Continue"}
                {!primaryIcon && !primaryLoading && (
                  <ArrowRight className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
            {secondaryAction}
          </div>
        )}
        {/* Step dots */}
        {showDots && (
          <div className="flex items-center justify-center">
            <StepDots current={currentStep} total={totalSteps} />
          </div>
        )}
      </div>
    </div>
  );
}

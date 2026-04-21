"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import type { ConfigureFooter } from "../../_components/onboarding-footer";

export function ReadyStep({
  onFinish,
  configureFooter,
}: {
  onFinish: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  useEffect(() => {
    configureFooter({
      onPrimary: onFinish,
      primaryLabel: "Open Canto",
      showBack: false,
      showDots: false,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10">
        <Check className="h-10 w-10 text-emerald-500" />
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-foreground">You're all set</h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground leading-relaxed">
          Canto is ready. Browse, watch, and track — your library will sync in the background.
        </p>
      </div>
    </div>
  );
}

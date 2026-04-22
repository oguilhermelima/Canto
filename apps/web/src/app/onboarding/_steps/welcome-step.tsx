"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import { authClient } from "@/lib/auth-client";

export function WelcomeStep({
  onNext,
  configureFooter,
}: {
  onNext: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  useEffect(() => {
    configureFooter({
      onPrimary: onNext,
      primaryLabel: "Get started",
      showBack: false,
      showDots: false,
      secondaryAction: (
        <button
          type="button"
          onClick={() => authClient.signOut().then(() => window.location.replace("/login"))}
          className="text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          Sign out
        </button>
      ),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <Image src="/canto.svg" alt="Canto" width={64} height={64} className="h-16 w-16 dark:invert" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Canto</h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground leading-relaxed">
          Your all-in-one media manager. Search for movies, shows, and anime across multiple
          torrent indexers, download them with one click, and automatically organize everything
          into your media library — ready for Jellyfin or Plex to pick up.
        </p>
      </div>
    </div>
  );
}

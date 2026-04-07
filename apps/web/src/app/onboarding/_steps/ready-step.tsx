"use client";

import { useEffect } from "react";
import { Check, Search, Download, FolderSync } from "lucide-react";
import type { ConfigureFooter } from "../_components/onboarding-footer";

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
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Everything is connected and ready to go. Start exploring — search for a movie,
          browse what's trending, or dive straight into downloading. All your settings
          can be adjusted anytime from the Settings page.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Discover</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Browse trending movies, shows, and anime across all your sources.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Download</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Search across your indexers and send torrents to qBittorrent with one click.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FolderSync className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Organize</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Files are renamed, sorted, and imported into your media library automatically.</p>
        </div>
      </div>
    </div>
  );
}

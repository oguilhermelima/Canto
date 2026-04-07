"use client";

import { useEffect } from "react";
import { Folder, Download, FolderOpen, Wand2 } from "lucide-react";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import { StepHeader } from "../_components/step-header";

export function LibrariesIntroStep({
  onNext,
  onBack,
  onSkip,
  configureFooter,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  useEffect(() => {
    configureFooter({ onPrimary: onNext, onSkip });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Folder className="h-8 w-8 text-primary" />
      </div>

      <StepHeader
        title="Libraries"
        description={
          <>
            Let's configure <strong>where everything goes</strong>.
            A library organizes one type of content — Movies, Shows, Anime — and handles the entire flow automatically.
          </>
        }
        onBack={onBack}
      />

      <div className="w-full max-w-lg text-left">
        <p className="mb-4 text-center text-sm font-medium text-muted-foreground">How it works</p>

        {/* Timeline */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center pt-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Download className="h-4 w-4 text-blue-400" />
            </div>
            <div className="w-px flex-1 bg-gradient-to-b from-blue-500/30 via-primary/40 to-emerald-500/30" />
          </div>
          <div className="pb-6 pt-1">
            <p className="text-sm font-semibold text-foreground">You download something</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Your torrent client saves files to the <strong className="text-blue-400">download path</strong>. They stay here for seeding.
            </p>
            <p className="mt-2 truncate font-mono text-sm text-muted-foreground">
              /downloads/movies/Some.Movie.2024.mkv
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex w-8 flex-col items-center">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <Wand2 className="h-3 w-3 text-primary" />
            </div>
          </div>
          <p className="text-sm font-medium text-primary self-center">Canto organizes & renames</p>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center pb-1">
            <div className="w-px flex-1 bg-gradient-to-b from-primary/40 to-emerald-500/30" />
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <FolderOpen className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div className="pt-6 pb-1">
            <p className="text-sm font-semibold text-foreground">Your media server picks it up</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Files appear in the <strong className="text-emerald-400">library path</strong> with clean names that Jellyfin and Plex recognize.
            </p>
            <div className="mt-2 overflow-hidden rounded-lg bg-muted/30 px-3 py-2.5">
              <p className="truncate font-mono text-sm text-emerald-400/80">
                /media/movies/Movie Title (2024)/
              </p>
              <p className="truncate font-mono text-sm text-muted-foreground pl-4">
                Movie Title (2024) [1080p].mkv
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

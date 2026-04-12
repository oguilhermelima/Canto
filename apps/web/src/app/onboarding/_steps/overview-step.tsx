"use client";

import { useEffect } from "react";
import { Search, Download, FolderSync, Sparkles, ChevronRight } from "lucide-react";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import { StepHeader } from "../_components/step-header";

export function OverviewStep({
  onNext,
  configureFooter,
}: {
  onNext: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  useEffect(() => {
    configureFooter({
      onPrimary: onNext,
      primaryLabel: "Let's set it up",
      primaryIcon: <Sparkles className="mr-2 h-4 w-4" />,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-10 text-center pt-16 md:pt-0">
      <StepHeader
        title="From search to screen"
        description="Canto handles everything behind the scenes so you can focus on what matters — watching. Here's what happens when you pick something."
      />

      {/* Horizontal pipeline — desktop */}
      <div className="hidden sm:flex w-full max-w-2xl items-start justify-center gap-2">
        <PipelineCard
          icon={Search}
          step="1"
          title="Find it"
          desc="Search across all your indexers or browse what's trending right now."
          accent="text-blue-400"
          bg="bg-blue-500/10"
        />
        <div className="flex items-center pt-10 text-muted-foreground">
          <ChevronRight className="h-5 w-5" />
        </div>
        <PipelineCard
          icon={Download}
          step="2"
          title="Grab it"
          desc="One click sends it to qBittorrent. Track progress right from Canto."
          accent="text-amber-400"
          bg="bg-amber-500/10"
        />
        <div className="flex items-center pt-10 text-muted-foreground">
          <ChevronRight className="h-5 w-5" />
        </div>
        <PipelineCard
          icon={FolderSync}
          step="3"
          title="Done"
          desc="Renamed, sorted, and ready in your library. Jellyfin or Plex picks it up."
          accent="text-emerald-400"
          bg="bg-emerald-500/10"
        />
      </div>

      {/* Vertical pipeline — mobile */}
      <div className="flex sm:hidden w-full flex-col gap-3">
        <MobileCard
          icon={Search}
          step="1"
          title="Find it"
          desc="Search across indexers or browse trending."
          accent="text-blue-400"
          bg="bg-blue-500/10"
        />
        <MobileCard
          icon={Download}
          step="2"
          title="Grab it"
          desc="One click sends it to qBittorrent."
          accent="text-amber-400"
          bg="bg-amber-500/10"
        />
        <MobileCard
          icon={FolderSync}
          step="3"
          title="Done"
          desc="Renamed, sorted, ready in your library."
          accent="text-emerald-400"
          bg="bg-emerald-500/10"
        />
      </div>

      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        We just need to connect a few services to make the magic happen.
        It only takes a couple of minutes.
      </p>
    </div>
  );
}

function PipelineCard({
  icon: Icon,
  step,
  title,
  desc,
  accent,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  step: string;
  title: string;
  desc: string;
  accent: string;
  bg: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center gap-3 rounded-2xl border border-border/30 bg-accent/20 p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{step}</p>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function MobileCard({
  icon: Icon,
  step,
  title,
  desc,
  accent,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  step: string;
  title: string;
  desc: string;
  accent: string;
  bg: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/30 bg-accent/20 p-4 text-left">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{step}</span>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

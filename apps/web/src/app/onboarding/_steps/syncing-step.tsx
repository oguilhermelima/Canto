"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Check, Tv, Film, Sparkles, FolderSync } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";

type TaskStatus = "pending" | "running" | "done" | "skipped";

interface SyncTask {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: TaskStatus;
}

export function SyncingStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [allDone, setAllDone] = useState(false);
  const started = useRef(false);

  const jellyfinEnabled = settings?.["jellyfin.enabled"] === true;
  const plexEnabled = settings?.["plex.enabled"] === true;

  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation();
  const syncPlex = trpc.plex.syncLibraries.useMutation();
  const rebuildRecs = trpc.media.rebuildMyRecommendations.useMutation();

  useEffect(() => {
    configureFooter({
      onPrimary: allDone ? onNext : undefined,
      primaryLabel: "Continue",
      showBack: false,
      showDots: true,
    });
  }, [allDone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const initial: SyncTask[] = [];
    if (jellyfinEnabled) initial.push({ id: "jellyfin", label: "Syncing Jellyfin library", icon: Tv, status: "pending" });
    if (plexEnabled) initial.push({ id: "plex", label: "Syncing Plex library", icon: Film, status: "pending" });
    initial.push({ id: "recs", label: "Building recommendations", icon: Sparkles, status: "pending" });

    if (initial.length === 1) {
      // Only recs, no media servers
      initial.unshift({ id: "organize", label: "Organizing your library", icon: FolderSync, status: "skipped" });
    }

    setTasks(initial);
    runTasks(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTask = (id: string, status: TaskStatus, prev: SyncTask[]): SyncTask[] => {
    const next = prev.map((t) => (t.id === id ? { ...t, status } : t));
    setTasks(next);
    return next;
  };

  const runTasks = async (taskList: SyncTask[]): Promise<void> => {
    let current = [...taskList];

    // Sync Jellyfin
    if (jellyfinEnabled) {
      current = updateTask("jellyfin", "running", current);
      try {
        await syncJellyfin.mutateAsync();
      } catch { /* non-fatal */ }
      current = updateTask("jellyfin", "done", current);
    }

    // Sync Plex
    if (plexEnabled) {
      current = updateTask("plex", "running", current);
      try {
        await syncPlex.mutateAsync();
      } catch { /* non-fatal */ }
      current = updateTask("plex", "done", current);
    }

    // Build recommendations
    current = updateTask("recs", "running", current);
    try {
      await rebuildRecs.mutateAsync();
    } catch { /* non-fatal */ }
    current = updateTask("recs", "done", current);

    setAllDone(true);
  };

  return (
    <div className="flex flex-col items-center gap-10 text-center pt-16 md:pt-0">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        {allDone ? (
          <Check className="h-8 w-8 text-emerald-400" />
        ) : (
          <FolderSync className="h-8 w-8 text-primary animate-pulse" />
        )}
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">
          {allDone ? "Everything's ready" : "Setting things up"}
        </h1>
        <p className="mx-auto max-w-md text-base text-muted-foreground leading-relaxed">
          {allDone
            ? "Your library is synced and recommendations are ready. One more step to go."
            : "Canto is syncing your media servers and preparing personalized recommendations. This will only take a moment."
          }
        </p>
      </div>

      {/* Task list */}
      <div className="w-full max-w-sm space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-4 rounded-xl bg-accent/30 px-4 py-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              {task.status === "running" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : task.status === "done" ? (
                <Check className="h-5 w-5 text-emerald-400" />
              ) : task.status === "skipped" ? (
                <task.icon className="h-5 w-5 text-muted-foreground/30" />
              ) : (
                <task.icon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <p className={`text-sm text-left ${
              task.status === "done" ? "text-foreground" :
              task.status === "running" ? "text-foreground" :
              task.status === "skipped" ? "text-muted-foreground/40" :
              "text-muted-foreground"
            }`}>
              {task.status === "done" ? task.label.replace("Syncing", "Synced").replace("Building", "Built").replace("Organizing", "Organized") : task.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Check, Tv, Film, Sparkles, FolderSync, AlertTriangle } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";

type TaskStatus = "pending" | "running" | "done" | "skipped" | "failed";

interface SyncTask {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: TaskStatus;
  error?: string;
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

  const updateTask = (
    id: string,
    status: TaskStatus,
    prev: SyncTask[],
    error?: string,
  ): SyncTask[] => {
    const next = prev.map((t) => (t.id === id ? { ...t, status, error } : t));
    setTasks(next);
    return next;
  };

  const runTasks = async (taskList: SyncTask[]): Promise<void> => {
    let current = [...taskList];

    // Each step is best-effort but its outcome is recorded so a failed sync
    // shows as "failed" (with a toast-style inline error) instead of silently
    // flipping to green. Onboarding still completes — the user can retry from
    // Settings — but they know something went wrong.
    const runStep = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
      current = updateTask(id, "running", current);
      try {
        await fn();
        current = updateTask(id, "done", current);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        current = updateTask(id, "failed", current, message);
      }
    };

    if (jellyfinEnabled) await runStep("jellyfin", () => syncJellyfin.mutateAsync());
    if (plexEnabled) await runStep("plex", () => syncPlex.mutateAsync());
    await runStep("recs", () => rebuildRecs.mutateAsync());

    setAllDone(true);
  };

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
    void runTasks(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            className="flex items-start gap-4 rounded-xl bg-accent/30 px-4 py-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              {task.status === "running" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : task.status === "done" ? (
                <Check className="h-5 w-5 text-emerald-400" />
              ) : task.status === "failed" ? (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              ) : task.status === "skipped" ? (
                <task.icon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <task.icon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col text-left">
              <p className={`text-sm ${
                task.status === "done" ? "text-foreground" :
                task.status === "running" ? "text-foreground" :
                task.status === "failed" ? "text-foreground" :
                task.status === "skipped" ? "text-muted-foreground" :
                "text-muted-foreground"
              }`}>
                {task.status === "done"
                  ? task.label.replace("Syncing", "Synced").replace("Building", "Built").replace("Organizing", "Organized")
                  : task.status === "failed"
                    ? task.label.replace("Syncing", "Couldn't sync").replace("Building", "Couldn't build")
                    : task.label}
              </p>
              {task.status === "failed" && task.error && (
                <p className="text-xs text-amber-400/80">{task.error} — retry from Settings later.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Tv, Film, Sparkles, FolderSync, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { MagicSetup   } from "@/components/onboarding/magic-setup";
import type {MagicTask, MagicTaskStatus} from "@/components/onboarding/magic-setup";

export function SyncingStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const jellyfinEnabled = settings?.["jellyfin.enabled"] === true;
  const plexEnabled = settings?.["plex.enabled"] === true;

  // Initialize the task list synchronously from the props on first render so
  // we don't have to setState inside the mount effect.
  const [tasks, setTasks] = useState<MagicTask[]>(() => {
    const initial: MagicTask[] = [];
    if (jellyfinEnabled) initial.push({ id: "jellyfin", label: "Syncing Jellyfin library", icon: Tv, status: "pending" });
    if (plexEnabled) initial.push({ id: "plex", label: "Syncing Plex library", icon: Film, status: "pending" });
    initial.push({ id: "recs", label: "Building recommendations", icon: Sparkles, status: "pending" });
    if (initial.length === 1) {
      initial.unshift({ id: "organize", label: "Organizing your library", icon: FolderSync, status: "skipped" });
    }
    return initial;
  });
  const [allDone, setAllDone] = useState(false);
  const started = useRef(false);

  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation();
  const syncPlex = trpc.plex.syncLibraries.useMutation();
  const rebuildRecs = trpc.media.rebuildMyRecommendations.useMutation();

  // The MagicSetup overlay sits on z-50 and covers the onboarding footer, so
  // hide the footer entirely and render the Continue CTA inside the overlay
  // when sync finishes. Prevents a hidden CTA users can't reach.
  useEffect(() => {
    configureFooter({ showBack: false, showDots: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTask = (
    id: string,
    status: MagicTaskStatus,
    prev: MagicTask[],
    error?: string,
  ): MagicTask[] => {
    const next = prev.map((t) => (t.id === id ? { ...t, status, error } : t));
    setTasks(next);
    return next;
  };

  const runTasks = async (taskList: MagicTask[]): Promise<void> => {
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
    // Defer one microtask so the setState calls inside runTasks happen after
    // commit instead of during it (avoids cascading renders during the mount
    // effect that the React-hooks lint rule warns about).
    queueMicrotask(() => void runTasks(tasks));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MagicSetup
      title={allDone ? "Tudo pronto" : "Estamos preparando sua experiência"}
      subtitle={
        allDone
          ? "Sua biblioteca está sincronizada e as recomendações já estão prontas."
          : "Sincronizando media servers e preparando recomendações personalizadas. Vai ser rapidinho."
      }
      tasks={tasks}
    >
      {allDone && (
        <button
          type="button"
          onClick={onNext}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#05030f] shadow-[0_8px_32px_rgba(167,139,250,0.45)] transition-transform hover:scale-[1.02]"
        >
          Continuar
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </MagicSetup>
  );
}

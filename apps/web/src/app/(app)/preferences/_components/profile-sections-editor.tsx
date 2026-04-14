"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { trpc } from "~/lib/trpc/client";
import { toast } from "sonner";
import { ProfileSectionRow } from "./profile-section-row";
import { SettingsSection } from "~/components/settings/shared";
import type { ProfileSectionConfig } from "@canto/db/schema";

interface SectionMeta {
  defaultTitle: string;
  description: string;
  defaultConfig?: ProfileSectionConfig;
}

const AVAILABLE_SECTIONS: Record<string, SectionMeta> = {
  // Narrative blocks
  stats_dashboard: { defaultTitle: "Journey", description: "Your watching journey — time, movies, shows, countries" },
  taste_map: { defaultTitle: "Taste", description: "Genre identity, decade sweet spot, taste profile" },
  insights: { defaultTitle: "Rating Voice", description: "How you rate, hidden gems, unpopular opinions" },
  // Media carousels
  top_favorites: { defaultTitle: "Hall of Fame", description: "Your favorited titles showcase" },
  currently_watching: { defaultTitle: "Currently Watching", description: "Titles you're mid-voyage on" },
  recent_ratings: { defaultTitle: "Recent Ratings", description: "Your latest verdicts" },
  watchlist_launchpad: { defaultTitle: "Launchpad", description: "Titles queued and waiting for launch" },
  recent_activity: { defaultTitle: "Recent Activity", description: "What you've been up to" },
  dropped_ships: { defaultTitle: "Dropped Ships", description: "Titles that didn't survive the voyage" },
};

interface Section {
  id?: string;
  position: number;
  sectionKey: string;
  title: string;
  config: ProfileSectionConfig;
  enabled: boolean;
}

export function ProfileSectionsEditor(): React.JSX.Element {
  const { data, isLoading, refetch } = trpc.profileSection.list.useQuery();
  const saveMutation = trpc.profileSection.save.useMutation({
    onSuccess: () => {
      toast.success("Profile layout saved");
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const resetMutation = trpc.profileSection.resetToDefaults.useMutation({
    onSuccess: () => {
      toast.success("Reset to defaults");
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [localSections, setLocalSections] = useState<Section[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sections = useMemo(
    () => localSections ?? (data?.sections as Section[] | undefined) ?? [],
    [localSections, data?.sections],
  );

  const usedKeys = useMemo(
    () => new Set(sections.map((s) => s.sectionKey)),
    [sections],
  );

  const availableToAdd = useMemo(
    () => Object.entries(AVAILABLE_SECTIONS).filter(([key]) => !usedKeys.has(key)),
    [usedKeys],
  );

  const updateSections = useCallback((newSections: Section[]) => {
    const reindexed = newSections.map((s, i) => ({ ...s, position: i }));
    setLocalSections(reindexed);
    setDirty(true);
  }, []);

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => (_e: React.DragEvent) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    const updated = [...sections];
    const [moved] = updated.splice(dragIndex, 1);
    if (moved) updated.splice(targetIndex, 0, moved);
    updateSections(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, sections, updateSections]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleToggleEnabled = useCallback((index: number) => () => {
    const updated = [...sections];
    const section = updated[index];
    if (section) {
      updated[index] = { ...section, enabled: !section.enabled };
      updateSections(updated);
    }
  }, [sections, updateSections]);

  const handleDelete = useCallback((index: number) => () => {
    const updated = sections.filter((_, i) => i !== index);
    updateSections(updated);
  }, [sections, updateSections]);

  const handleAdd = useCallback((sectionKey: string) => {
    const meta = AVAILABLE_SECTIONS[sectionKey];
    if (!meta) return;
    const newSection: Section = {
      position: sections.length,
      sectionKey,
      title: meta.defaultTitle,
      config: meta.defaultConfig ?? {},
      enabled: true,
    };
    updateSections([...sections, newSection]);
  }, [sections, updateSections]);

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      sections: sections.map((s) => ({
        id: s.id,
        position: s.position,
        sectionKey: s.sectionKey as Parameters<typeof saveMutation.mutate>[0]["sections"][number]["sectionKey"],
        title: s.title,
        config: s.config,
        enabled: s.enabled,
      })),
    });
    setDirty(false);
  }, [sections, saveMutation]);

  const handleReset = useCallback(() => {
    resetMutation.mutate();
    setLocalSections(null);
    setDirty(false);
  }, [resetMutation]);

  return (
    <SettingsSection title="Profile Sections" description="Choose and reorder the sections on your public profile.">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="relative">
          {availableToAdd.length > 0 && (
            <div className="group relative">
              <Button variant="ghost" size="sm" className="rounded-lg text-xs text-muted-foreground">
                <Plus size={14} />
                Add
              </Button>
              <div className="invisible absolute left-0 top-full z-30 mt-1 max-h-[320px] min-w-[260px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg group-focus-within:visible group-hover:visible">
                {availableToAdd.map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAdd(key)}
                    className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {meta.defaultTitle}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {meta.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className="rounded-lg text-xs text-muted-foreground"
          >
            <RotateCcw size={12} />
            Reset
          </Button>
          {dirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="rounded-lg text-xs"
            >
              {saveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Section List */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/40 py-12 text-center">
          <p className="text-sm text-muted-foreground">No sections configured</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sections.map((section, i) => (
            <ProfileSectionRow
              key={section.id ?? `pos-${section.position}`}
              section={section}
              isDragTarget={dragOverIndex === i}
              onDelete={handleDelete(i)}
              onToggleEnabled={handleToggleEnabled(i)}
              onDragStart={handleDragStart(i)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

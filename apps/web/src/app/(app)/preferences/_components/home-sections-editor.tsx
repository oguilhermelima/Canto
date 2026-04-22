"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { SectionRow } from "./section-row";
import { SectionEditorDialog } from "./section-editor-dialog";
import { SettingsSection } from "@/components/settings/shared";
import type { HomeSectionConfig } from "@canto/db/schema";

interface Section {
  id?: string;
  position: number;
  title: string;
  style: string;
  sourceType: string;
  sourceKey: string;
  config: HomeSectionConfig;
  enabled: boolean;
}

export function HomeSectionsEditor(): React.JSX.Element {
  const { data, isLoading, refetch } = trpc.homeSection.list.useQuery();
  const saveMutation = trpc.homeSection.save.useMutation({
    onSuccess: () => {
      toast.success("Layout saved");
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const resetMutation = trpc.homeSection.resetToDefaults.useMutation({
    onSuccess: () => {
      toast.success("Reset to defaults");
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [localSections, setLocalSections] = useState<Section[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Use local state if modified, otherwise use server data
  const sections = useMemo(
    () => localSections ?? data?.sections ?? [],
    [localSections, data?.sections],
  );

  const updateSections = useCallback((newSections: Section[]) => {
    const reindexed = newSections.map((s, i) => ({ ...s, position: i }));
    setLocalSections(reindexed);
    setDirty(true);
  }, []);

  // Drag-and-drop handlers
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

  const handleEditOpen = useCallback((index: number) => () => {
    setEditingSection(sections[index] ?? null);
    setEditorOpen(true);
  }, [sections]);

  const handleAddOpen = useCallback(() => {
    setEditingSection({
      position: sections.length,
      title: "",
      style: "card",
      sourceType: "tmdb",
      sourceKey: "trending",
      config: { type: "movie" },
      enabled: true,
    });
    setEditorOpen(true);
  }, [sections.length]);

  const handleEditorSave = useCallback((draft: Section) => {
    const updated = [...sections];
    const existingIndex = draft.id
      ? updated.findIndex((s) => s.id === draft.id)
      : updated.findIndex((s) => s.position === draft.position && !s.id);

    if (existingIndex >= 0) {
      updated[existingIndex] = draft;
    } else {
      updated.push({ ...draft, position: updated.length });
    }
    updateSections(updated);
    setEditorOpen(false);
  }, [sections, updateSections]);

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      sections: sections.map((s) => ({
        id: s.id,
        position: s.position,
        title: s.title,
        style: s.style as "spotlight" | "large_video" | "card" | "cover",
        sourceType: s.sourceType as "db" | "tmdb",
        sourceKey: s.sourceKey,
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
    <SettingsSection title="Home Sections" description="Configure and reorder the sections on your homepage.">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddOpen}
          disabled={sections.length >= 30}
          className="rounded-lg text-xs text-muted-foreground"
        >
          <Plus size={14} />
          Add
        </Button>
        <div className="flex items-center gap-2">
          {sections.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{sections.length}/30</span>
          )}
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
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">No sections configured</p>
          <button
            type="button"
            onClick={handleAddOpen}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus size={15} />
            Add your first section
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sections.map((section, i) => (
            <SectionRow
              key={section.id ?? `pos-${section.position}`}
              section={section}
              isDragTarget={dragOverIndex === i}
              onEdit={handleEditOpen(i)}
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


      <SectionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        section={editingSection}
        onSave={handleEditorSave}
      />
    </SettingsSection>
  );
}

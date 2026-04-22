"use client";

import { useState, useCallback, useMemo } from "react";
import { RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { ProfileSectionRow } from "./profile-section-row";
import { SettingsSection } from "@/components/settings/shared";
import type { ProfileSectionConfig } from "@canto/db/schema";
import type { ProfileSectionKey } from "@canto/validators";

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

  const sections = useMemo(
    () => localSections ?? (data?.sections as Section[] | undefined) ?? [],
    [localSections, data?.sections],
  );

  const handleToggleEnabled = useCallback(
    (index: number) => () => {
      const updated = [...sections];
      const section = updated[index];
      if (section) {
        updated[index] = { ...section, enabled: !section.enabled };
        setLocalSections(updated);
        setDirty(true);
      }
    },
    [sections],
  );

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      sections: sections.map((s) => ({
        id: s.id,
        position: s.position,
        sectionKey: s.sectionKey as ProfileSectionKey,
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
    <SettingsSection
      title="Profile Sections"
      description="Toggle which sections appear on your profile. The order is curated and can't be changed."
    >
      <div className="mb-3 flex items-center justify-end gap-2">
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
            {saveMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}
            Save
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sections.map((section, i) => (
            <ProfileSectionRow
              key={section.id ?? `pos-${section.position}`}
              section={section}
              onToggleEnabled={handleToggleEnabled(i)}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

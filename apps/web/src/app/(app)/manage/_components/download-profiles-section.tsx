"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { StateMessage } from "@canto/ui/state-message";
import { trpc } from "@/lib/trpc/client";
import { SettingsSection } from "@/components/settings/shared";
import {
  
  
  
  EMPTY_DRAFT,
  FLAVORS,
  createEmptyDraft,
  profileRowToDraft
} from "./download-profile-defaults";
import type {Flavor, ProfileDraft, ProfileRow} from "./download-profile-defaults";
import { DownloadProfileEditor } from "./download-profile-editor";
import { DownloadProfileFlavorGroup } from "./download-profile-flavor-group";

export function DownloadProfilesSection(): React.JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [editorKey, setEditorKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data: profiles, isLoading } = trpc.downloadProfile.list.useQuery();
  const utils = trpc.useUtils();

  const invalidate = useCallback((): void => {
    void utils.downloadProfile.list.invalidate();
  }, [utils]);

  const setDefault = trpc.downloadProfile.setDefault.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Default profile updated");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const remove = trpc.downloadProfile.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Profile removed");
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const seed = trpc.downloadProfile.seed.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Default profiles seeded");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const typedProfiles = useMemo<ProfileRow[]>(
    () => (profiles ?? []) as ProfileRow[],
    [profiles],
  );

  const grouped = useMemo(() => {
    const result: Record<Flavor, ProfileRow[]> = {
      movie: [],
      show: [],
      anime: [],
    };
    for (const p of typedProfiles) {
      const f = p.flavor as Flavor;
      if (f in result) result[f].push(p);
    }
    return result;
  }, [typedProfiles]);

  const openCreate = useCallback((flavor: Flavor): void => {
    setEditorDraft(createEmptyDraft(flavor));
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((p: ProfileRow): void => {
    setEditorDraft(profileRowToDraft(p));
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
  }, []);

  const handleSetDefault = useCallback(
    (id: string): void => {
      setDefault.mutate({ id });
    },
    [setDefault],
  );

  const handleDelete = useCallback((p: ProfileRow): void => {
    setConfirmDelete({ id: p.id, name: p.name });
  }, []);

  const closeEditor = useCallback((): void => setEditorOpen(false), []);
  const onEditorSaved = useCallback((): void => {
    setEditorOpen(false);
    invalidate();
  }, [invalidate]);

  return (
    <>
      <SettingsSection
        title="Download Profiles"
        description="Per-flavor profiles control which (quality, source) combos the search accepts and how strongly each is preferred. Folders pick a default profile; new media snapshots it on add."
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : typedProfiles.length === 0 ? (
          <div className="flex flex-col items-center">
            <StateMessage
              preset="emptyServerLibrary"
              title="No profiles in orbit"
              description="Seed the TRaSH-aligned defaults (one per flavor) or build your own."
              action={{
                label: seed.isPending ? "Seeding…" : "Seed defaults",
                onClick: () => seed.mutate(),
              }}
              minHeight="240px"
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 rounded-xl"
              onClick={() => openCreate("movie")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New profile
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {FLAVORS.map((flavor) => (
              <DownloadProfileFlavorGroup
                key={flavor}
                flavor={flavor}
                profiles={grouped[flavor]}
                onCreate={openCreate}
                onEdit={openEdit}
                onSetDefault={handleSetDefault}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <DownloadProfileEditor
        open={editorOpen}
        initialDraft={editorDraft}
        resetKey={editorKey}
        onClose={closeEditor}
        onSaved={onEditorSaved}
      />

      <ConfirmationDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete profile?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be removed. Folders and media still pointing to it fall back to the default for the flavor.`
            : undefined
        }
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => {
          if (confirmDelete) remove.mutate({ id: confirmDelete.id });
        }}
      />
    </>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { trpc } from "@/lib/trpc/client";
import { SettingsSection } from "@/components/settings/shared";
import {
  type Flavor,
  type ProfileDraft,
  type ProfileRow,
  EMPTY_DRAFT,
  FLAVORS,
  createEmptyDraft,
  profileRowToDraft,
} from "./download-profile-defaults";
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

  const typedProfiles: ProfileRow[] = (profiles ?? []) as ProfileRow[];

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
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              No download profiles yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Seed the TRaSH-aligned defaults (one per flavor) or create your
              own.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
                {seed.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Seeding…
                  </>
                ) : (
                  "Seed defaults"
                )}
              </Button>
              <Button variant="ghost" onClick={() => openCreate("movie")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                New profile
              </Button>
            </div>
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

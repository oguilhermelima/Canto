"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@canto/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Slider } from "@canto/ui/slider";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { Plus, Trash2, Star, Pencil, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { SettingsSection } from "@/components/settings/shared";

type Flavor = "movie" | "show" | "anime";
type Quality = "uhd" | "fullhd" | "hd" | "sd";
type Source = "remux" | "bluray" | "webdl" | "webrip" | "hdtv";

interface AllowedFormat {
  quality: Quality;
  source: Source;
  weight: number;
}

interface ProfileRow {
  id: string;
  name: string;
  flavor: string;
  allowedFormats: AllowedFormat[];
  cutoffQuality: string | null;
  cutoffSource: string | null;
  minTotalScore: number;
  isDefault: boolean;
}

interface ProfileDraft {
  id?: string;
  name: string;
  flavor: Flavor;
  allowedFormats: AllowedFormat[];
  cutoffQuality: Quality | null;
  cutoffSource: Source | null;
  minTotalScore: number;
}

const FLAVOR_LABELS: Record<Flavor, string> = {
  movie: "Movies",
  show: "Shows",
  anime: "Anime",
};

const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "uhd", label: "4K / UHD" },
  { value: "fullhd", label: "1080p" },
  { value: "hd", label: "720p" },
  { value: "sd", label: "SD" },
];

const SOURCE_OPTIONS: Array<{ value: Source; label: string }> = [
  { value: "remux", label: "Remux" },
  { value: "bluray", label: "Bluray" },
  { value: "webdl", label: "WEB-DL" },
  { value: "webrip", label: "WEBRip" },
  { value: "hdtv", label: "HDTV" },
];

const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  flavor: "movie",
  allowedFormats: [{ quality: "fullhd", source: "bluray", weight: 40 }],
  cutoffQuality: null,
  cutoffSource: null,
  minTotalScore: 0,
};

const formatLabel = (q: Quality, s: Source): string => {
  const ql = QUALITY_OPTIONS.find((o) => o.value === q)?.label ?? q;
  const sl = SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s;
  return `${ql} ${sl}`;
};

/* ─── Section ─── */

export function DownloadProfilesSection(): React.JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data: profiles, isLoading } = trpc.downloadProfile.list.useQuery();
  const utils = trpc.useUtils();

  const invalidate = (): void => {
    void utils.downloadProfile.list.invalidate();
  };

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

  const openCreate = (flavor: Flavor): void => {
    setDraft({ ...EMPTY_DRAFT, flavor });
    setEditorOpen(true);
  };

  const openEdit = (p: ProfileRow): void => {
    setDraft({
      id: p.id,
      name: p.name,
      flavor: p.flavor as Flavor,
      allowedFormats: p.allowedFormats.map((f) => ({
        quality: f.quality as Quality,
        source: f.source as Source,
        weight: f.weight,
      })),
      cutoffQuality: (p.cutoffQuality as Quality | null) ?? null,
      cutoffSource: (p.cutoffSource as Source | null) ?? null,
      minTotalScore: p.minTotalScore,
    });
    setEditorOpen(true);
  };

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
              Seed the TRaSH-aligned defaults (one per flavor) or create
              your own.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                onClick={() => seed.mutate()}
                disabled={seed.isPending}
              >
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
            {(["movie", "show", "anime"] as const).map((flavor) => (
              <FlavorGroup
                key={flavor}
                flavor={flavor}
                profiles={grouped[flavor]}
                onCreate={() => openCreate(flavor)}
                onEdit={openEdit}
                onSetDefault={(id) => setDefault.mutate({ id })}
                onDelete={(p) =>
                  setConfirmDelete({ id: p.id, name: p.name })
                }
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <ProfileEditorDialog
        open={editorOpen}
        draft={draft}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          invalidate();
        }}
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

/* ─── Flavor group ─── */

function FlavorGroup({
  flavor,
  profiles,
  onCreate,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  flavor: Flavor;
  profiles: ProfileRow[];
  onCreate: () => void;
  onEdit: (p: ProfileRow) => void;
  onSetDefault: (id: string) => void;
  onDelete: (p: ProfileRow) => void;
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          {FLAVOR_LABELS[flavor]}
        </h4>
        <Button variant="ghost" size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New profile
        </Button>
      </div>
      {profiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No profiles yet. Create one to constrain {FLAVOR_LABELS[flavor].toLowerCase()} searches.
        </p>
      ) : (
        <div className="grid gap-2">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              onEdit={() => onEdit(p)}
              onSetDefault={() => onSetDefault(p.id)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Card ─── */

function ProfileCard({
  profile,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  profile: ProfileRow;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const cutoffLabel =
    profile.cutoffQuality && profile.cutoffSource
      ? formatLabel(
          profile.cutoffQuality as Quality,
          profile.cutoffSource as Source,
        )
      : "No cutoff";

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h5 className="text-sm font-semibold text-foreground">
              {profile.name}
            </h5>
            {profile.isDefault && (
              <Badge variant="secondary" className="text-[10px]">
                <Star className="mr-1 h-2.5 w-2.5" />
                Default
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile.allowedFormats.length} allowed format
            {profile.allowedFormats.length !== 1 ? "s" : ""} · cutoff:{" "}
            {cutoffLabel}
            {profile.minTotalScore > 0 && (
              <> · min score {profile.minTotalScore}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!profile.isDefault && (
            <Button variant="ghost" size="sm" onClick={onSetDefault}>
              <Star className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Editor dialog ─── */

function ProfileEditorDialog({
  open,
  draft: initialDraft,
  onClose,
  onSaved,
}: {
  open: boolean;
  draft: ProfileDraft;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);

  useEffect(() => {
    if (open) setDraft(initialDraft);
  }, [open, initialDraft]);

  const create = trpc.downloadProfile.create.useMutation({
    onSuccess: () => {
      toast.success("Profile created");
      onSaved();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const update = trpc.downloadProfile.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      onSaved();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const isPending = create.isPending || update.isPending;
  const isEditing = !!draft.id;

  const handleSave = (): void => {
    const payload = {
      name: draft.name.trim(),
      flavor: draft.flavor,
      allowedFormats: draft.allowedFormats,
      cutoffQuality: draft.cutoffQuality,
      cutoffSource: draft.cutoffSource,
      minTotalScore: draft.minTotalScore,
    };
    if (!payload.name) {
      toast.error("Name is required");
      return;
    }
    if (payload.allowedFormats.length === 0) {
      toast.error("Add at least one allowed format");
      return;
    }
    if (
      (payload.cutoffQuality && !payload.cutoffSource) ||
      (!payload.cutoffQuality && payload.cutoffSource)
    ) {
      toast.error("Cutoff requires both quality and source");
      return;
    }
    if (isEditing && draft.id) {
      update.mutate({ id: draft.id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  const cutoffEnabled =
    draft.cutoffQuality !== null && draft.cutoffSource !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Download Profile" : "New Download Profile"}
          </DialogTitle>
          <DialogDescription>
            Tune which (quality, source) combos the search accepts and how
            they rank.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                placeholder="e.g. 1080p Bluray Preferred"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Flavor
              </label>
              <Select
                value={draft.flavor}
                onValueChange={(v) =>
                  setDraft({ ...draft, flavor: v as Flavor })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movies</SelectItem>
                  <SelectItem value="show">Shows</SelectItem>
                  <SelectItem value="anime">Anime</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <AllowedFormatsEditor
            value={draft.allowedFormats}
            onChange={(v) => setDraft({ ...draft, allowedFormats: v })}
          />

          <CutoffEditor
            allowed={draft.allowedFormats}
            enabled={cutoffEnabled}
            quality={draft.cutoffQuality}
            source={draft.cutoffSource}
            onChange={(q, s) =>
              setDraft({ ...draft, cutoffQuality: q, cutoffSource: s })
            }
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Minimum total score
              </label>
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {draft.minTotalScore}
              </span>
            </div>
            <Slider
              value={[draft.minTotalScore]}
              onValueChange={([v]) =>
                setDraft({ ...draft, minTotalScore: v ?? 0 })
              }
              min={0}
              max={100}
              step={5}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Releases with a normalised score below this threshold are
              dropped from results. 0 = no extra filter.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : isEditing ? (
              "Save changes"
            ) : (
              "Create profile"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Allowed formats editor ─── */

function AllowedFormatsEditor({
  value,
  onChange,
}: {
  value: AllowedFormat[];
  onChange: (v: AllowedFormat[]) => void;
}): React.JSX.Element {
  const updateRow = (i: number, patch: Partial<AllowedFormat>): void => {
    const next = [...value];
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  };

  const removeRow = (i: number): void => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const addRow = (): void => {
    onChange([
      ...value,
      { quality: "fullhd", source: "webdl", weight: 30 },
    ]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Allowed formats
        </label>
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add format
        </Button>
      </div>
      <div className="space-y-2">
        {value.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 rounded-xl bg-muted/30 p-2"
          >
            <Select
              value={row.quality}
              onValueChange={(v) => updateRow(i, { quality: v as Quality })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.source}
              onValueChange={(v) => updateRow(i, { source: v as Source })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              max={100}
              value={row.weight}
              onChange={(e) =>
                updateRow(i, {
                  weight: Math.max(
                    0,
                    Math.min(100, parseInt(e.target.value, 10) || 0),
                  ),
                })
              }
              className="h-9 w-20 tabular-nums"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRow(i)}
              disabled={value.length === 1}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Higher weight = stronger preference. Recommended: 30 baseline, 45
        top preference.
      </p>
    </div>
  );
}

/* ─── Cutoff editor ─── */

function CutoffEditor({
  allowed,
  enabled,
  quality,
  source,
  onChange,
}: {
  allowed: AllowedFormat[];
  enabled: boolean;
  quality: Quality | null;
  source: Source | null;
  onChange: (q: Quality | null, s: Source | null) => void;
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Upgrade cutoff
          </label>
          <p className="text-[11px] text-muted-foreground">
            Stop searching for upgrades when this combo is reached.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            if (checked) {
              const first = allowed[0];
              onChange(
                first?.quality ?? "fullhd",
                first?.source ?? "bluray",
              );
            } else {
              onChange(null, null);
            }
          }}
        />
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={quality ?? ""}
            onValueChange={(v) => onChange(v as Quality, source)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Quality" />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={source ?? ""}
            onValueChange={(v) => onChange(quality, v as Source)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

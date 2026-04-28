"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Slider } from "@canto/ui/slider";
import { Switch } from "@canto/ui/switch";
import { trpc } from "@/lib/trpc/client";
import {
  type AllowedFormat,
  type Flavor,
  type ProfileDraft,
  type Quality,
  type Source,
  QUALITY_OPTIONS,
  SOURCE_OPTIONS,
} from "./download-profile-defaults";
import { DownloadProfileFormatsField } from "./download-profile-formats-field";

interface DownloadProfileEditorProps {
  open: boolean;
  initialDraft: ProfileDraft;
  resetKey: number;
  onClose: () => void;
  onSaved: () => void;
}

export function DownloadProfileEditor({
  open,
  initialDraft,
  resetKey,
  onClose,
  onSaved,
}: DownloadProfileEditorProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto md:max-w-2xl">
        <DownloadProfileEditorBody
          key={resetKey}
          initialDraft={initialDraft}
          onClose={onClose}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DownloadProfileEditorBodyProps {
  initialDraft: ProfileDraft;
  onClose: () => void;
  onSaved: () => void;
}

function DownloadProfileEditorBody({
  initialDraft,
  onClose,
  onSaved,
}: DownloadProfileEditorBodyProps): React.JSX.Element {
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);

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
  const cutoffEnabled =
    draft.cutoffQuality !== null && draft.cutoffSource !== null;

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

  const setCutoff = (q: Quality | null, s: Source | null): void => {
    setDraft({ ...draft, cutoffQuality: q, cutoffSource: s });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEditing ? "Edit Download Profile" : "New Download Profile"}
        </DialogTitle>
        <DialogDescription>
          Tune which (quality, source) combos the search accepts and how they
          rank.
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
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
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

        <DownloadProfileFormatsField
          value={draft.allowedFormats}
          onChange={(v) => setDraft({ ...draft, allowedFormats: v })}
        />

        <CutoffField
          allowed={draft.allowedFormats}
          enabled={cutoffEnabled}
          quality={draft.cutoffQuality}
          source={draft.cutoffSource}
          onChange={setCutoff}
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
            Releases with a normalised score below this threshold are dropped
            from results. 0 = no extra filter.
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
    </>
  );
}

interface CutoffFieldProps {
  allowed: AllowedFormat[];
  enabled: boolean;
  quality: Quality | null;
  source: Source | null;
  onChange: (q: Quality | null, s: Source | null) => void;
}

function CutoffField({
  allowed,
  enabled,
  quality,
  source,
  onChange,
}: CutoffFieldProps): React.JSX.Element {
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
              onChange(first?.quality ?? "fullhd", first?.source ?? "bluray");
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

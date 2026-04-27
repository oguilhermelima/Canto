"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { SettingsSection } from "@/components/settings/shared";

type Av1Stance = "neutral" | "prefer" | "avoid";

type Prefs = {
  preferredLanguages: string[];
  preferredStreamingServices: string[];
  preferredEditions: string[];
  avoidedEditions: string[];
  av1Stance: Av1Stance;
};

const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "pt-br", label: "Portuguese (BR)" },
  { value: "ja", label: "Japanese" },
  { value: "es", label: "Spanish" },
  { value: "es-la", label: "Spanish (LATAM)" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "tr", label: "Turkish" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
];

const STREAMING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "NF", label: "Netflix" },
  { value: "AMZN", label: "Amazon" },
  { value: "ATVP", label: "Apple TV+" },
  { value: "DSNP", label: "Disney+" },
  { value: "HMAX", label: "HBO Max" },
  { value: "HULU", label: "Hulu" },
  { value: "PCOK", label: "Peacock" },
  { value: "PMTP", label: "Paramount+" },
  { value: "STAN", label: "Stan" },
  { value: "CR", label: "Crunchyroll" },
];

// Mirror EDITION_MAP from packages/core/src/domain/torrents/rules/parsing-release.ts
const EDITION_OPTIONS: string[] = [
  "Director's Cut",
  "Extended",
  "Remastered",
  "Unrated",
  "Uncut",
  "Theatrical",
  "IMAX",
  "Criterion",
  "Anniversary Edition",
  "Collector's Edition",
  "Final Cut",
  "Special Edition",
];

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function DownloadPreferencesSection(): React.JSX.Element {
  const { data, isLoading } = trpc.preferences.downloads.get.useQuery();
  const utils = trpc.useUtils();
  const setMutation = trpc.preferences.downloads.set.useMutation({
    onSuccess: () => {
      void utils.preferences.downloads.get.invalidate();
      toast.success("Download preferences saved");
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const [draft, setDraft] = useState<Prefs | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return (
      !arraysEqual(data.preferredLanguages, draft.preferredLanguages) ||
      !arraysEqual(
        data.preferredStreamingServices,
        draft.preferredStreamingServices,
      ) ||
      !arraysEqual(data.preferredEditions, draft.preferredEditions) ||
      !arraysEqual(data.avoidedEditions, draft.avoidedEditions) ||
      data.av1Stance !== draft.av1Stance
    );
  }, [data, draft]);

  if (isLoading || !draft) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  type ListKey = Exclude<keyof Prefs, "av1Stance">;

  const toggleIn =
    (key: ListKey) =>
    (value: string): void => {
      setDraft((prev) => {
        if (!prev) return prev;
        const list = prev[key];
        const next = list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value];
        return { ...prev, [key]: next };
      });
    };

  const handleSave = (): void => {
    if (!draft) return;
    setMutation.mutate(draft);
  };

  const handleReset = (): void => {
    if (data) setDraft(data);
  };

  return (
    <div>
      <SettingsSection
        title="Download Preferences"
        description="Tune which torrent releases the search prefers. Each list bumps the matching release's score; nothing is filtered out."
      >
        <PrefList
          label="Languages"
          help="Releases containing these languages get a boost."
          options={LANGUAGE_OPTIONS}
          selected={draft.preferredLanguages}
          onToggle={toggleIn("preferredLanguages")}
        />
        <PrefList
          label="Streaming services"
          help="Prefer WEB-DL releases tagged with these platforms."
          options={STREAMING_OPTIONS}
          selected={draft.preferredStreamingServices}
          onToggle={toggleIn("preferredStreamingServices")}
        />
        <PrefList
          label="Preferred editions"
          help="Releases tagged with these editions outrank the standard cut."
          options={EDITION_OPTIONS.map((e) => ({ value: e, label: e }))}
          selected={draft.preferredEditions}
          onToggle={toggleIn("preferredEditions")}
        />
        <PrefList
          label="Avoided editions"
          help="Releases with these tags rank below their absence."
          options={EDITION_OPTIONS.map((e) => ({ value: e, label: e }))}
          selected={draft.avoidedEditions}
          onToggle={toggleIn("avoidedEditions")}
          tone="negative"
        />

        <div>
          <div className="mb-2">
            <p className="text-sm font-medium text-foreground">
              AV1 codec stance
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AV1 is newer and more efficient but support is uneven. Pick
              "Prefer" if your devices play AV1 well, or "Avoid" to fall
              back to H.264/H.265.
            </p>
          </div>
          <Select
            value={draft.av1Stance}
            onValueChange={(v) =>
              setDraft((prev) =>
                prev ? { ...prev, av1Stance: v as Av1Stance } : prev,
              )
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="prefer">Prefer AV1</SelectItem>
              <SelectItem value="avoid">Avoid AV1</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>

      {dirty && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-end gap-2 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="mr-auto text-xs text-muted-foreground">
            Unsaved changes
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={setMutation.isPending}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={setMutation.isPending}
          >
            {setMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Chip picker ─── */

function PrefList({
  label,
  help,
  options,
  selected,
  onToggle,
  tone = "positive",
}: {
  label: string;
  help: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
  tone?: "positive" | "negative";
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                active && tone === "positive"
                  ? "border-primary bg-primary/10 text-primary"
                  : active && tone === "negative"
                    ? "border-destructive/60 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

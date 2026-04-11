"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import { cn } from "@canto/ui/cn";
import { AlertCircle, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/lib/trpc/client";

export type EditMatchTarget =
  | {
      mode: "media";
      mediaId: string;
      title: string;
      type: "movie" | "show";
      tmdbId: number | null;
    }
  | {
      mode: "version";
      versionId: string;
      title: string;
      type: "movie" | "show";
      tmdbId: number | null;
    };

interface ResolutionPreview {
  versionsAffected: number;
  targetMediaId: string;
  targetTitle: string;
  targetYear: number | null;
  orphanedMedia: Array<{ id: string; title: string; year: number | null }>;
}

interface EditMatchDialogProps {
  target: EditMatchTarget | null;
  onClose: () => void;
  onResolved: () => void;
}

export function EditMatchDialog({
  target,
  onClose,
  onResolved,
}: EditMatchDialogProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [tmdbIdInput, setTmdbIdInput] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<{
    tmdbId: number;
    type: "movie" | "show";
  } | null>(null);
  const [updateServer, setUpdateServer] = useState(false);
  const [preview, setPreview] = useState<ResolutionPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const utils = trpc.useUtils();

  useEffect(() => {
    if (target) {
      setSearchQuery(target.title);
      setTmdbIdInput("");
      setSelectedMatch(null);
      setUpdateServer(false);
      setPreview(null);
      setIsPreviewing(false);
    }
  }, [target]);

  const searchResults = trpc.sync.searchForMediaVersion.useQuery(
    {
      query: searchQuery,
      type: target?.type ?? "movie",
    },
    { enabled: searchQuery.length > 1 && !!target && !preview },
  );

  const resolveMutation = trpc.sync.resolveMediaVersion.useMutation({
    onSuccess: (result) => {
      const res = result as {
        suggestedName?: string;
        versionsAffected?: number;
      };
      const count = res.versionsAffected ?? 0;
      toast.success(
        count > 1
          ? `Re-pointed ${count} versions to ${res.suggestedName ?? "target"}`
          : `Matched to: ${res.suggestedName ?? "target"}`,
      );
      onResolved();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function buildResolveInput(): {
    tmdbId: number;
    type: "movie" | "show";
    updateMediaServer: boolean;
    mediaId?: string;
    versionId?: string;
  } | null {
    if (!target) return null;
    const tmdbId =
      selectedMatch?.tmdbId ??
      (tmdbIdInput ? parseInt(tmdbIdInput, 10) : null) ??
      target.tmdbId;
    if (!tmdbId || Number.isNaN(tmdbId)) return null;
    const type = selectedMatch?.type ?? target.type;
    const base = { tmdbId, type, updateMediaServer: updateServer };
    if (target.mode === "media") {
      return { ...base, mediaId: target.mediaId };
    }
    return { ...base, versionId: target.versionId };
  }

  async function handleSave(): Promise<void> {
    const input = buildResolveInput();
    if (!input) return;
    setIsPreviewing(true);
    try {
      const previewResult = (await utils.sync.getResolveMediaVersionPreview.fetch(
        input,
      )) as ResolutionPreview;

      if (previewResult.orphanedMedia.length === 0) {
        resolveMutation.mutate(input);
      } else {
        setPreview(previewResult);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Preview failed";
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleApplyPreview(): void {
    const input = buildResolveInput();
    if (!input) return;
    resolveMutation.mutate(input);
  }

  function handleBackFromPreview(): void {
    setPreview(null);
  }

  const canSubmit =
    !!target &&
    !resolveMutation.isPending &&
    !isPreviewing &&
    (!!selectedMatch || !!tmdbIdInput || !!target.tmdbId);

  return (
    <Dialog
      open={!!target}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "media"
              ? `Fix match: ${target.title}`
              : `Fix version match: ${target?.title ?? ""}`}
          </DialogTitle>
          {target?.mode === "media" && (
            <p className="text-xs text-muted-foreground">
              Re-points every version currently under this media.
            </p>
          )}
          {target?.mode === "version" && (
            <p className="text-xs text-muted-foreground">
              Re-points this single version only.
            </p>
          )}
        </DialogHeader>

        {!preview ? (
          <>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  TMDB ID
                </label>
                <Input
                  value={tmdbIdInput}
                  onChange={(e) => {
                    setTmdbIdInput(e.target.value);
                    setSelectedMatch(null);
                  }}
                  placeholder="e.g. 12345"
                  className="h-10 rounded-xl border-none bg-muted/50 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border/40" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Search by name
                </label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search TMDB…"
                  className="h-10 rounded-xl border-none bg-muted/50 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
                />
              </div>

              {searchResults.data && searchResults.data.results.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-border/40">
                  {searchResults.data.results.slice(0, 10).map((result) => {
                    const isSelected =
                      selectedMatch?.tmdbId === result.externalId;
                    return (
                      <button
                        key={`${result.externalId}-${result.type}`}
                        type="button"
                        onClick={() => {
                          setSelectedMatch({
                            tmdbId: result.externalId,
                            type: result.type as "movie" | "show",
                          });
                          setTmdbIdInput("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/30",
                        )}
                      >
                        {result.posterPath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${result.posterPath}`}
                            alt=""
                            className="h-12 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-8 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                            N/A
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {result.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {result.year} · {result.type}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-border/40 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Also update on Jellyfin/Plex
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        Correct the metadata on the media server so it
                        displays the right title and poster
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={updateServer}
                    onCheckedChange={setUpdateServer}
                  />
                </div>
                {updateServer && (
                  <div className="ml-8 flex items-start gap-3 rounded-lg bg-amber-500/10 px-3 py-2.5">
                    <p className="text-xs leading-relaxed text-amber-500">
                      Canto will update the TMDB/TVDB provider IDs on this
                      item and trigger a metadata refresh. This changes how
                      the item appears in your media server.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!canSubmit}
                onClick={() => {
                  void handleSave();
                }}
              >
                {(isPreviewing || resolveMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </>
        ) : (
          <OrphanConfirmation
            preview={preview}
            loading={resolveMutation.isPending}
            onCancel={handleBackFromPreview}
            onApply={handleApplyPreview}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OrphanConfirmation({
  preview,
  loading,
  onCancel,
  onApply,
}: {
  preview: ResolutionPreview;
  loading: boolean;
  onCancel: () => void;
  onApply: () => void;
}): React.JSX.Element {
  const MAX_VISIBLE = 5;
  const visible = preview.orphanedMedia.slice(0, MAX_VISIBLE);
  const extra = preview.orphanedMedia.length - visible.length;
  const count = preview.orphanedMedia.length;

  return (
    <>
      <div className="space-y-4 pt-2">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Re-pointing {preview.versionsAffected}{" "}
                {preview.versionsAffected === 1 ? "version" : "versions"} to{" "}
                {preview.targetTitle}
                {preview.targetYear != null && ` (${preview.targetYear})`}
              </p>
              <p className="mt-2 text-sm text-foreground">
                This will also delete {count} orphaned media{" "}
                {count === 1 ? "row" : "rows"}:
              </p>
              <ul className="mt-2 space-y-1">
                {visible.map((m) => (
                  <li
                    key={m.id}
                    className="text-xs text-muted-foreground"
                  >
                    · {m.title}
                    {m.year != null && ` (${m.year})`}
                  </li>
                ))}
                {extra > 0 && (
                  <li className="text-xs text-muted-foreground">
                    · and {extra} more
                  </li>
                )}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                These media rows have no other versions and were not
                downloaded by Canto, so they&apos;ll be removed from your
                library.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          className="bg-red-500 text-white hover:bg-red-600"
          disabled={loading}
          onClick={onApply}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Apply changes
        </Button>
      </div>
    </>
  );
}

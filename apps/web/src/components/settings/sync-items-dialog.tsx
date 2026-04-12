"use client";

import { useEffect, useMemo, useState } from "react";
import { useDebounceValue } from "usehooks-ts";
import {
  Dialog,
  DialogContent,
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
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/lib/trpc/client";
import { TabBar } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";

import {
  MediaVersionGroupRow
  
} from "./media-version-group-row";
import type {MediaVersionGroupData} from "./media-version-group-row";
import {
  UnmatchedVersionRow
  
} from "./unmatched-version-row";
import type {UnmatchedVersionRowData} from "./unmatched-version-row";
import type { MediaVersionRowData } from "./media-version-row";
import {
  EditMatchDialog
  
} from "./edit-match-dialog";
import type {EditMatchTarget} from "./edit-match-dialog";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type ResultTab = "all" | "imported" | "unmatched" | "failed";
type ServerFilter = "all" | "jellyfin" | "plex";

const PAGE_SIZE = 20;

interface SyncItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multipleServers: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Deep link helpers                                                          */
/* -------------------------------------------------------------------------- */

function buildPlexDeepLink(
  plexUrl: string | null,
  machineId: string | null,
  ratingKey: string,
): string | null {
  if (!plexUrl || !machineId) return null;
  return `${plexUrl}/web/index.html#!/server/${machineId}/details?key=${encodeURIComponent(
    `/library/metadata/${ratingKey}`,
  )}`;
}

function buildJellyfinDeepLink(
  jellyfinUrl: string | null,
  jellyfinItemId: string,
): string | null {
  if (!jellyfinUrl) return null;
  return `${jellyfinUrl}/web/#/details?id=${jellyfinItemId}`;
}

/* -------------------------------------------------------------------------- */
/*  Row normalization                                                          */
/* -------------------------------------------------------------------------- */

type RawVersion = {
  id: string;
  source: string;
  serverItemId: string;
  serverItemTitle: string;
  serverItemPath: string | null;
  serverItemYear: number | null;
  result: string;
  reason: string | null;
  resolution: string | null;
  videoCodec: string | null;
  hdr: string | null;
  primaryAudioLang: string | null;
  fileSize: number | null;
};

function normalizeVersion(raw: RawVersion): MediaVersionRowData {
  return {
    id: raw.id,
    source: raw.source === "plex" ? "plex" : "jellyfin",
    serverItemId: raw.serverItemId,
    serverItemTitle: raw.serverItemTitle,
    serverItemPath: raw.serverItemPath,
    result: raw.result,
    reason: raw.reason,
    resolution: raw.resolution,
    videoCodec: raw.videoCodec,
    hdr: raw.hdr,
    primaryAudioLang: raw.primaryAudioLang,
    fileSize: raw.fileSize,
  };
}

function normalizeUnmatched(raw: RawVersion): UnmatchedVersionRowData {
  return {
    ...normalizeVersion(raw),
    serverItemYear: raw.serverItemYear,
  };
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function SyncItemsDialog({
  open,
  onOpenChange,
  multipleServers,
}: SyncItemsDialogProps): React.JSX.Element {
  const [tab, setTab] = useState<ResultTab>("all");
  const [serverFilter, setServerFilter] = useState<ServerFilter>("all");
  const [rawSearch, setRawSearch] = useState("");
  const [debouncedSearch] = useDebounceValue(rawSearch, 300);
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<EditMatchTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const utils = trpc.useUtils();

  // Reset page + expansion when filters change
  useEffect(() => {
    setPage(1);
    setExpandedIds(new Set());
  }, [tab, serverFilter, debouncedSearch]);

  // Reset expansion on page change
  useEffect(() => {
    setExpandedIds(new Set());
  }, [page]);

  const trimmedSearch = debouncedSearch.trim();

  const listQuery = trpc.sync.listMediaVersionGroups.useQuery(
    {
      server: serverFilter === "all" ? undefined : serverFilter,
      tab,
      search: trimmedSearch.length > 0 ? trimmedSearch : undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: open },
  );
  const { data, isLoading } = listQuery;

  const countsQuery = trpc.sync.getMediaVersionCounts.useQuery(undefined, {
    enabled: open,
  });
  const deepLinkQuery = trpc.sync.getServerDeepLinkConfig.useQuery(undefined, {
    enabled: open,
  });

  const deleteMutation = trpc.sync.deleteMediaVersion.useMutation({
    onSuccess: () => {
      toast.success("Version removed");
      setDeleteTarget(null);
      void utils.sync.listMediaVersionGroups.invalidate();
      void utils.sync.getMediaVersionCounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = data ? Math.ceil(data.totalGroups / data.pageSize) : 0;

  const tabs = useMemo(() => {
    const counts = countsQuery.data;
    return [
      { value: "all" as const, label: "All", count: counts?.all },
      {
        value: "imported" as const,
        label: "Imported",
        count: counts?.imported,
      },
      {
        value: "unmatched" as const,
        label: "Unmatched",
        count: counts?.unmatched,
      },
      { value: "failed" as const, label: "Failed", count: counts?.failed },
    ];
  }, [countsQuery.data]);

  const { matchedGroups, unmatchedRows } = useMemo(() => {
    const rawGroups = data?.groups ?? [];
    const matched: MediaVersionGroupData[] = [];
    const unmatched: UnmatchedVersionRowData[] = [];

    for (const g of rawGroups) {
      if (g.media) {
        matched.push({
          media: g.media,
          versions: g.versions.map((v: RawVersion) => normalizeVersion(v)),
        });
      } else {
        for (const v of g.versions as RawVersion[]) {
          unmatched.push(normalizeUnmatched(v));
        }
      }
    }

    return { matchedGroups: matched, unmatchedRows: unmatched };
  }, [data]);

  function toggleExpanded(mediaId: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  }

  function canOpenOnServer(source: "jellyfin" | "plex"): boolean {
    const cfg = deepLinkQuery.data;
    if (!cfg) return false;
    if (source === "jellyfin") return !!cfg.jellyfinUrl;
    return !!cfg.plexUrl && !!cfg.plexMachineId;
  }

  function handleOpenServer(version: MediaVersionRowData): void {
    const cfg = deepLinkQuery.data;
    if (!cfg) {
      toast.error("Server configuration unavailable");
      return;
    }
    const link =
      version.source === "plex"
        ? buildPlexDeepLink(cfg.plexUrl, cfg.plexMachineId, version.serverItemId)
        : buildJellyfinDeepLink(cfg.jellyfinUrl, version.serverItemId);

    if (!link) {
      toast.error(
        version.source === "plex"
          ? "Plex deep link not configured"
          : "Jellyfin deep link not configured",
      );
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function handleEditMedia(group: MediaVersionGroupData): void {
    setEditTarget({
      mode: "media",
      mediaId: group.media.id,
      title: group.media.title,
      type: (group.media.type as "movie" | "show") ?? "movie",
      tmdbId: group.media.externalId,
    });
  }

  function handleEditVersion(
    version: MediaVersionRowData,
    title: string,
    type: "movie" | "show",
  ): void {
    setEditTarget({
      mode: "version",
      versionId: version.id,
      title,
      type,
      tmdbId: null,
    });
  }

  function handleDeleteVersion(version: { id: string; title: string }): void {
    setDeleteTarget(version);
  }

  const hasContent = matchedGroups.length > 0 || unmatchedRows.length > 0;
  const showUnmatchedDivider =
    tab === "all" && matchedGroups.length > 0 && unmatchedRows.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[85vh] max-h-[780px] max-w-3xl flex-col gap-4 p-0">
          <DialogHeader bar>
            <DialogTitle>Library items</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Review media matched from your servers. Expand a title to see its
              versions, or fix incorrect matches.
            </p>
          </DialogHeader>

          <div className="shrink-0 px-6">
            <TabBar
              tabs={tabs}
              value={tab}
              onChange={(v) => setTab(v as ResultTab)}
              className="mb-0 py-0"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 px-6">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Search by title…"
                className="h-10 rounded-xl border-none bg-muted/50 pl-9 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
              />
            </div>
            {multipleServers && (
              <Select
                value={serverFilter}
                onValueChange={(v) => setServerFilter(v as ServerFilter)}
              >
                <SelectTrigger className="h-10 w-40 rounded-xl border-none bg-muted/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="jellyfin">Jellyfin</SelectItem>
                  <SelectItem value="plex">Plex</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            {listQuery.isError ? (
              <StateMessage
                preset="error"
                onRetry={() => listQuery.refetch()}
                minHeight="240px"
              />
            ) : isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : hasContent ? (
              <div className="space-y-2">
                {matchedGroups.map((group) => (
                  <MediaVersionGroupRow
                    key={group.media.id}
                    group={group}
                    expanded={expandedIds.has(group.media.id)}
                    onToggle={() => toggleExpanded(group.media.id)}
                    onEditMedia={() => handleEditMedia(group)}
                    onEditVersion={(v) =>
                      handleEditVersion(
                        v,
                        group.media.title,
                        (group.media.type as "movie" | "show") ?? "movie",
                      )
                    }
                    onDeleteVersion={(v) =>
                      handleDeleteVersion({
                        id: v.id,
                        title: group.media.title,
                      })
                    }
                    onOpenServer={handleOpenServer}
                    canOpenOnServer={canOpenOnServer}
                  />
                ))}

                {showUnmatchedDivider && (
                  <div className="flex items-center gap-3 px-1 py-3">
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Needs attention
                    </span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                )}

                {unmatchedRows.map((version) => (
                  <UnmatchedVersionRow
                    key={version.id}
                    version={version}
                    canOpenOnServer={canOpenOnServer(version.source)}
                    onOpenServer={() => handleOpenServer(version)}
                    onEdit={() =>
                      setEditTarget({
                        mode: "version",
                        versionId: version.id,
                        title: version.serverItemTitle,
                        type: "movie",
                        tmdbId: null,
                      })
                    }
                    onDelete={() =>
                      handleDeleteVersion({
                        id: version.id,
                        title: version.serverItemTitle,
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <StateMessage
                preset={trimmedSearch ? "emptyFiltered" : "emptyGrid"}
                minHeight="240px"
              />
            )}
          </div>

          {totalPages > 1 && data && (
            <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border/40 px-6 py-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {data.totalGroups}{" "}
                {data.totalGroups === 1 ? "group" : "groups"}, {data.totalVersions}{" "}
                {data.totalVersions === 1 ? "version" : "versions"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditMatchDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onResolved={() => {
          void utils.sync.listMediaVersionGroups.invalidate();
          void utils.sync.getMediaVersionCounts.invalidate();
        }}
      />

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        title="Remove this version?"
        description={deleteTarget?.title}
        body={
          <p className="text-sm leading-relaxed text-muted-foreground">
            Canto will stop tracking this version. The file on your server is
            untouched.
          </p>
        }
        confirmLabel="Remove"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate({ versionId: deleteTarget.id });
        }}
      />
    </>
  );
}

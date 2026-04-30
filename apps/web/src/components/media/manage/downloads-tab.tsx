"use client";

import { Badge } from "@canto/ui/badge";
import { Download, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, resolveState } from "@/lib/torrent-utils";
import { ContentSeasonList } from "./content-season-list";
import type { FileItem, SeasonData } from "./content-season-list";
import { TorrentMiniRow, SeasonActions } from "./torrent-row";
import type { TorrentItem } from "./torrent-row";
import { epKey } from "./use-manage-modal";
import type { useManageModal } from "./use-manage-modal";

type ManageData = ReturnType<typeof useManageModal>;

interface DownloadsTabProps {
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  torrentsLoading: boolean;
  filesByEpKey: ManageData["filesByEpKey"];
  movieFiles: ManageData["movieFiles"];
  liveTorrents: ManageData["liveTorrents"];
  torrentsBySeason: ManageData["torrentsBySeason"];
  torrentPause: ManageData["torrentPause"];
  torrentResume: ManageData["torrentResume"];
  torrentDelete: ManageData["torrentDelete"];
  torrentRetry: ManageData["torrentRetry"];
  torrentRename: ManageData["torrentRename"];
  torrentMove: ManageData["torrentMove"];
}

export function DownloadsTab({
  mediaType,
  seasons,
  torrentsLoading,
  filesByEpKey,
  movieFiles,
  liveTorrents,
  torrentsBySeason,
  torrentPause,
  torrentResume,
  torrentDelete,
  torrentRetry,
  torrentRename,
  torrentMove,
}: DownloadsTabProps): React.JSX.Element {
  const allTorrents = (liveTorrents ?? []) as TorrentItem[];
  const totalFiles =
    movieFiles.length +
    Array.from(filesByEpKey.values()).reduce(
      (count, files) => count + files.length,
      0,
    );
  const completedTorrents = allTorrents.filter((t) =>
    resolveState(t.status, t.live?.state, t.live?.progress).isDownloaded,
  ).length;
  const activeTorrents = allTorrents.length - completedTorrents;
  const orderedTorrents = [...allTorrents].sort((a, b) => {
    const aDone = resolveState(
      a.status,
      a.live?.state,
      a.live?.progress,
    ).isDownloaded;
    const bDone = resolveState(
      b.status,
      b.live?.state,
      b.live?.progress,
    ).isDownloaded;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  const handleRenameTorrent = (
    torrentId: string,
    currentTitle: string,
  ): void => {
    const newName = window.prompt("Rename to:", currentTitle);
    if (!newName || newName === currentTitle) return;
    torrentRename.mutate({ id: torrentId, newName });
  };

  const handleMoveTorrent = (
    torrentId: string,
    currentPath?: string | null,
  ): void => {
    const newPath = window.prompt("Move to:", currentPath ?? "");
    if (!newPath) return;
    torrentMove.mutate({ id: torrentId, newPath });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/[0.08] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Torrents
          </p>
          <p className="mt-1 text-xl font-semibold">{allTorrents.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/[0.08] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Active
          </p>
          <p className="mt-1 text-xl font-semibold">{activeTorrents}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/[0.08] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Downloaded Files
          </p>
          <p className="mt-1 text-xl font-semibold">{totalFiles}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Download className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Torrents</p>
          <span className="ml-auto text-xs text-muted-foreground">
            {completedTorrents} completed
          </span>
        </div>
        {orderedTorrents.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {torrentsLoading
              ? "Loading torrents..."
              : "No torrents linked to this title yet."}
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {orderedTorrents.map((torrent) => (
              <div key={torrent.id} className="px-4 py-2.5">
                <TorrentMiniRow
                  torrent={torrent}
                  onPause={() => torrentPause.mutate({ id: torrent.id })}
                  onResume={() => torrentResume.mutate({ id: torrent.id })}
                  onRetry={() => torrentRetry.mutate({ id: torrent.id })}
                  onDelete={() =>
                    torrentDelete.mutate({
                      id: torrent.id,
                      deleteFiles: true,
                      removeTorrent: true,
                    })
                  }
                  onRename={() => handleRenameTorrent(torrent.id, torrent.title)}
                  onMove={() => handleMoveTorrent(torrent.id, torrent.contentPath)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Files by content</p>
        </div>
        <div className="p-3">
          <ContentSeasonList
            mediaType={mediaType}
            seasons={seasons}
            loading={torrentsLoading}
            emptyText="No downloaded files linked to this title"
            getEpisodeItems={(sn, en) => {
              const key = epKey(sn, en);
              const files = (filesByEpKey.get(key) ?? []) as FileItem[];
              return { files, torrents: [] };
            }}
            getMovieItems={() => ({
              files: movieFiles as FileItem[],
              torrents: [],
            })}
            renderFileRow={(f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <HardDrive className="h-3 w-3 shrink-0 text-green-500" />
                <span className="min-w-0 flex-1 truncate">
                  {f.filePath.split("/").pop()}
                </span>
                {f.sizeBytes ? <span>{formatBytes(f.sizeBytes)}</span> : null}
                {f.quality && f.quality !== "unknown" && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    {f.quality}
                  </Badge>
                )}
              </div>
            )}
            renderTorrentRow={() => null}
            seasonActions={(sn) => {
              const seasonTorrents = torrentsBySeason.get(sn) ?? [];
              return (
                <SeasonActions
                  hasContent={seasonTorrents.length > 0}
                  onDelete={() => {
                    for (const t of seasonTorrents)
                      torrentDelete.mutate({
                        id: t.id,
                        deleteFiles: true,
                        removeTorrent: true,
                      });
                    if (seasonTorrents.length > 0)
                      toast.success(
                        `Deleting ${seasonTorrents.length} torrent(s)`,
                      );
                  }}
                  onRename={() => {
                    for (const t of seasonTorrents)
                      handleRenameTorrent(t.id, t.title);
                  }}
                  onMove={() => {
                    if (seasonTorrents.length === 0) return;
                    const currentPath =
                      seasonTorrents[0]?.contentPath ?? "";
                    const newPath = window.prompt(
                      "Move season to:",
                      currentPath,
                    );
                    if (!newPath || newPath === currentPath) return;
                    for (const t of seasonTorrents)
                      torrentMove.mutate({ id: t.id, newPath });
                  }}
                />
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

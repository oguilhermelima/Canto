"use client";

import { Badge } from "@canto/ui/badge";
import { HardDrive } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "~/lib/torrent-utils";
import { ContentSeasonList } from "./content-season-list";
import type { FileItem, SeasonData } from "./content-season-list";
import { TorrentMiniRow, SeasonActions } from "./torrent-row";
import type { TorrentItem } from "./torrent-row";
import { epKey } from "./use-manage-media";
import type { useManageMedia } from "./use-manage-media";

type ManageData = ReturnType<typeof useManageMedia>;

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
    <ContentSeasonList
      mediaType={mediaType}
      seasons={seasons}
      loading={torrentsLoading}
      emptyText="No downloads for this title"
      getEpisodeItems={(sn, en) => {
        const key = epKey(sn, en);
        const files = (filesByEpKey.get(key) ?? []) as FileItem[];
        const torrents =
          liveTorrents?.filter(
            (t) =>
              t.seasonNumber === sn &&
              t.episodeNumbers?.includes(en),
          ) ?? [];
        return { files, torrents };
      }}
      getMovieItems={() => ({
        files: movieFiles as FileItem[],
        torrents: (liveTorrents ?? []) as TorrentItem[],
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
      renderTorrentRow={(t) => {
        const torrent = t as TorrentItem;
        return (
          <TorrentMiniRow
            key={torrent.id}
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
        );
      }}
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
  );
}

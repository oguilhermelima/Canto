"use client";

import { useState } from "react";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import {
  ChevronDown,
  ChevronRight,
  File,
  HardDrive,
  Server,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { formatBytes, qualityBadge, sourceBadge } from "~/lib/torrent-utils";

interface FilesTabProps {
  mediaId: string;
  drawerOpen: boolean;
}

interface FileItem {
  id: string;
  filePath: string;
  quality: string | null;
  source: string | null;
  sizeBytes: number | null;
  episode: {
    id: string;
    number: number;
    title: string | null;
    seasonId: string;
    season: { id: string; number: number };
  } | null;
  torrent: {
    id: string;
    quality: string | null;
    source: string | null;
    title: string | null;
  } | null;
}

export function FilesTab({ mediaId, drawerOpen }: FilesTabProps) {
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number | null>>(
    () => new Set(),
  );
  const [initialized, setInitialized] = useState(false);

  const { data: files, isLoading: filesLoading } =
    trpc.media.listFiles.useQuery(
      { mediaId },
      { staleTime: 60_000, enabled: drawerOpen },
    );

  const { data: availability } = trpc.sync.mediaAvailability.useQuery(
    { mediaId },
    { staleTime: Infinity, enabled: drawerOpen },
  );

  // Group files by season number
  const seasonGroups = new Map<number | null, FileItem[]>();
  if (files) {
    for (const file of files) {
      const sn = file.episode?.season?.number ?? null;
      if (!seasonGroups.has(sn)) seasonGroups.set(sn, []);
      seasonGroups.get(sn)!.push(file);
    }
  }

  // Sort seasons: null (movie) first, then numerically
  const sortedSeasons = [...seasonGroups.keys()].sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return a - b;
  });

  // Initialize expanded state to first season once data loads
  if (files && files.length > 0 && !initialized) {
    setExpandedSeasons(new Set([sortedSeasons[0] ?? null]));
    setInitialized(true);
  }

  function toggleSeason(sn: number | null) {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) {
        next.delete(sn);
      } else {
        next.add(sn);
      }
      return next;
    });
  }

  if (filesLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
        <File className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No files found</p>
      </div>
    );
  }

  const movieFiles = seasonGroups.get(null);
  const showSeasons = sortedSeasons.filter((sn) => sn !== null);
  const isMovie = showSeasons.length === 0 && movieFiles;

  return (
    <div className="flex flex-col gap-3">
      {isMovie && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {movieFiles.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              availability={availability}
            />
          ))}
        </div>
      )}

      {!isMovie &&
        sortedSeasons.map((sn) => {
          const seasonFiles = seasonGroups.get(sn)!;
          const expanded = expandedSeasons.has(sn);
          const totalSize = seasonFiles.reduce(
            (sum, f) => sum + (f.sizeBytes ?? 0),
            0,
          );
          const sorted = [...seasonFiles].sort((a, b) => {
            const ae = a.episode?.number ?? 0;
            const be = b.episode?.number ?? 0;
            return ae - be;
          });

          return (
            <div key={sn ?? "null"} className="rounded-lg border border-border">
              <button
                onClick={() => toggleSeason(sn)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium">
                  {sn !== null ? `Season ${sn}` : "Other Files"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {seasonFiles.length} file{seasonFiles.length !== 1 && "s"}
                </span>
                {totalSize > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatBytes(totalSize)}
                  </span>
                )}
              </button>

              {expanded && (
                <div className="divide-y divide-border border-t border-border">
                  {sorted.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      availability={availability}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function FileRow({
  file,
  availability,
}: {
  file: FileItem;
  availability:
    | {
        sources: Array<{
          type: "jellyfin" | "plex";
          resolution?: string | null;
          videoCodec?: string | null;
          episodeCount?: number;
        }>;
        episodes: Record<
          string,
          Array<{ type: string; resolution?: string | null }>
        >;
      }
    | undefined;
}) {
  const sn = file.episode?.season?.number;
  const en = file.episode?.number;
  const quality = file.quality ?? file.torrent?.quality ?? "unknown";
  const source = file.source ?? file.torrent?.source ?? "unknown";
  const qb = qualityBadge(quality);
  const sb = sourceBadge(source);

  const epKey =
    sn != null && en != null
      ? `S${String(sn).padStart(2, "0")}E${String(en).padStart(2, "0")}`
      : null;

  const epAvailability = epKey ? availability?.episodes?.[epKey] : undefined;
  const hasJellyfin = epAvailability?.some((a) => a.type === "jellyfin");
  const hasPlex = epAvailability?.some((a) => a.type === "plex");

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-10 text-xs font-medium text-muted-foreground">
        {en != null ? `E${en.toString().padStart(2, "0")}` : "--"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {file.episode?.title ?? file.filePath.split("/").pop()}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {qb && (
            <Badge
              variant="outline"
              className={`h-5 px-1.5 text-[10px] ${qb.className}`}
            >
              {qb.label}
            </Badge>
          )}
          {sb && (
            <Badge
              variant="outline"
              className={`h-5 px-1.5 text-[10px] ${sb.className}`}
            >
              {sb.label}
            </Badge>
          )}
          {file.sizeBytes != null && file.sizeBytes > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatBytes(file.sizeBytes)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {file.sizeBytes != null && file.sizeBytes > 0 && (
          <HardDrive className="h-4 w-4 text-green-500" />
        )}
        {hasJellyfin && <Server className="h-4 w-4 text-blue-500" />}
        {hasPlex && <Server className="h-4 w-4 text-amber-500" />}
      </div>
    </div>
  );
}

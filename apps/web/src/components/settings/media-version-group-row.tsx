"use client";

import Image from "next/image";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import {
  ChevronRight,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from "lucide-react";

import {
  MediaVersionRow
  
} from "./media-version-row";
import type {MediaVersionRowData} from "./media-version-row";

function posterUrlFor(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/w92${path}`;
}

export interface MediaVersionGroupData {
  media: {
    id: string;
    title: string;
    year: number | null;
    posterPath: string | null;
    type: string;
    externalId: number | null;
  };
  versions: MediaVersionRowData[];
}

export type AggregateStatus = "imported" | "unmatched" | "failed";

const STATUS_META: Record<
  AggregateStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    className: string;
  }
> = {
  imported: {
    label: "Imported",
    icon: CheckCircle2,
    className: "text-emerald-400",
  },
  unmatched: {
    label: "Needs review",
    icon: AlertTriangle,
    className: "text-amber-400",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "text-destructive",
  },
};

export function aggregateStatusFor(
  versions: { result: string }[],
): AggregateStatus {
  if (versions.some((v) => v.result === "failed")) return "failed";
  if (versions.some((v) => v.result === "unmatched")) return "unmatched";
  return "imported";
}

interface MediaVersionGroupRowProps {
  group: MediaVersionGroupData;
  expanded: boolean;
  onToggle: () => void;
  onEditMedia: () => void;
  onEditVersion: (version: MediaVersionRowData) => void;
  onDeleteVersion: (version: MediaVersionRowData) => void;
  onOpenServer: (version: MediaVersionRowData) => void;
  canOpenOnServer: (source: "jellyfin" | "plex") => boolean;
}

export function MediaVersionGroupRow({
  group,
  expanded,
  onToggle,
  onEditMedia,
  onEditVersion,
  onDeleteVersion,
  onOpenServer,
  canOpenOnServer,
}: MediaVersionGroupRowProps): React.JSX.Element {
  const status = aggregateStatusFor(group.versions);
  const statusMeta = STATUS_META[status];
  const StatusIcon = statusMeta.icon;
  const versionCount = group.versions.length;
  const posterUrl = posterUrlFor(group.media.posterPath);
  const initial = group.media.title.charAt(0).toUpperCase();

  return (
    <div className="overflow-hidden rounded-xl bg-muted/40 transition-colors hover:bg-muted/60">
      <div className="flex items-center gap-4 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt=""
              width={40}
              height={56}
              className="h-14 w-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-sm text-muted-foreground">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {group.media.title}
              </p>
              {group.media.year && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {group.media.year}
                </span>
              )}
              {group.media.externalId && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
                  #{group.media.externalId}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "flex items-center gap-1.5 font-medium",
                  statusMeta.className,
                )}
              >
                <StatusIcon size={12} />
                {statusMeta.label}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-foreground/70">
                <Layers size={12} className="text-muted-foreground/50" />
                {versionCount === 1 ? "1 version" : `${versionCount} versions`}
              </span>
            </div>
          </div>
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 w-9 shrink-0 rounded-xl p-0"
          title="Fix match for all versions"
          onClick={onEditMedia}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border/50 px-5 py-4">
          {group.versions.map((version) => (
            <MediaVersionRow
              key={version.id}
              version={version}
              canOpenOnServer={canOpenOnServer(version.source)}
              onOpenServer={() => onOpenServer(version)}
              onEdit={() => onEditVersion(version)}
              onDelete={() => onDeleteVersion(version)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import {
  ExternalLink,
  Pencil,
  Trash2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

import { QualityChips } from "./quality-chips";
import type { MediaVersionRowData } from "./media-version-row";

export interface UnmatchedVersionRowData extends MediaVersionRowData {
  serverItemYear: number | null;
}

interface UnmatchedVersionRowProps {
  version: UnmatchedVersionRowData;
  canOpenOnServer: boolean;
  onOpenServer: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const SOURCE_BADGE: Record<
  "jellyfin" | "plex",
  { label: string; className: string }
> = {
  jellyfin: {
    label: "Jellyfin",
    className: "bg-blue-500/15 text-blue-400",
  },
  plex: {
    label: "Plex",
    className: "bg-amber-500/15 text-amber-400",
  },
};

export function UnmatchedVersionRow({
  version,
  canOpenOnServer,
  onOpenServer,
  onEdit,
  onDelete,
}: UnmatchedVersionRowProps): React.JSX.Element {
  const badge = SOURCE_BADGE[version.source];
  const isFailed = version.result === "failed";
  const StatusIcon = isFailed ? XCircle : AlertTriangle;

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl px-5 py-4 transition-colors",
        isFailed
          ? "bg-destructive/10 hover:bg-destructive/15"
          : "bg-amber-500/10 hover:bg-amber-500/15",
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {version.serverItemTitle}
          </p>
          {version.serverItemYear != null && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {version.serverItemYear}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium",
              isFailed ? "text-destructive" : "text-amber-400",
            )}
          >
            <StatusIcon size={12} />
            {isFailed ? "Failed" : "Unmatched"}
          </span>
          <span
            className={cn(
              "shrink-0 rounded px-2 py-0.5 font-semibold",
              badge.className,
            )}
          >
            {badge.label}
          </span>
          <QualityChips meta={version} />
        </div>
        {version.serverItemPath && (
          <p
            className="truncate font-mono text-xs text-muted-foreground"
            title={version.serverItemPath}
          >
            {version.serverItemPath}
          </p>
        )}
        {version.reason && (
          <p
            className={cn(
              "text-xs",
              isFailed ? "text-destructive" : "text-amber-400/90",
            )}
          >
            {version.reason}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {canOpenOnServer && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0"
            title={`Open in ${badge.label}`}
            onClick={onOpenServer}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-9 w-9 p-0"
          title="Assign match"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
          title="Remove version"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

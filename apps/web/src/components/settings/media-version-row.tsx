"use client";

import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";

import { QualityChips } from "./quality-chips";

export interface MediaVersionRowData {
  id: string;
  source: "jellyfin" | "plex";
  serverItemId: string;
  serverItemTitle: string;
  serverItemPath: string | null;
  result: string;
  reason: string | null;
  resolution: string | null;
  videoCodec: string | null;
  hdr: string | null;
  primaryAudioLang: string | null;
  fileSize: number | null;
}

interface MediaVersionRowProps {
  version: MediaVersionRowData;
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

export function MediaVersionRow({
  version,
  canOpenOnServer,
  onOpenServer,
  onEdit,
  onDelete,
}: MediaVersionRowProps): React.JSX.Element {
  const badge = SOURCE_BADGE[version.source];
  const isFailed = version.result === "failed";

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg px-4 py-3",
        isFailed ? "bg-destructive/10" : "bg-background/60",
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            className={cn(
              "shrink-0 rounded px-2 py-0.5 text-xs font-semibold",
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
        {isFailed && version.reason && (
          <p className="text-xs text-destructive">{version.reason}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {canOpenOnServer && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title={`Open in ${badge.label}`}
            onClick={onOpenServer}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          title="Edit match"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          title="Remove version"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

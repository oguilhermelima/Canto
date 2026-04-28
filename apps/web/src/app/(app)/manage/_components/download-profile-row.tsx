"use client";

import { Pencil, Star, Trash2 } from "lucide-react";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import {
  type ProfileRow,
  type Quality,
  type Source,
  formatLabel,
} from "./download-profile-defaults";

interface DownloadProfileRowProps {
  profile: ProfileRow;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

export function DownloadProfileRow({
  profile,
  onEdit,
  onSetDefault,
  onDelete,
}: DownloadProfileRowProps): React.JSX.Element {
  const cutoffLabel =
    profile.cutoffQuality && profile.cutoffSource
      ? formatLabel(
          profile.cutoffQuality as Quality,
          profile.cutoffSource as Source,
        )
      : "No cutoff";

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h5 className="text-sm font-semibold text-foreground">
              {profile.name}
            </h5>
            {profile.isDefault && (
              <Badge variant="secondary" className="text-[10px]">
                <Star className="mr-1 h-2.5 w-2.5" />
                Default
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile.allowedFormats.length} allowed format
            {profile.allowedFormats.length !== 1 ? "s" : ""} · cutoff:{" "}
            {cutoffLabel}
            {profile.minTotalScore > 0 && (
              <> · min score {profile.minTotalScore}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!profile.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSetDefault}
              aria-label="Set as default"
            >
              <Star className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label="Edit profile"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label="Delete profile"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

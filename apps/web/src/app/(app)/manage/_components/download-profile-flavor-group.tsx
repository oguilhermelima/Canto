"use client";

import { memo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@canto/ui/button";
import {
  type Flavor,
  type ProfileRow,
  FLAVOR_LABELS,
} from "./download-profile-defaults";
import { DownloadProfileRow } from "./download-profile-row";

interface DownloadProfileFlavorGroupProps {
  flavor: Flavor;
  profiles: ProfileRow[];
  onCreate: (flavor: Flavor) => void;
  onEdit: (p: ProfileRow) => void;
  onSetDefault: (id: string) => void;
  onDelete: (p: ProfileRow) => void;
}

export const DownloadProfileFlavorGroup = memo(
  function DownloadProfileFlavorGroup({
    flavor,
    profiles,
    onCreate,
    onEdit,
    onSetDefault,
    onDelete,
  }: DownloadProfileFlavorGroupProps): React.JSX.Element {
    const label = FLAVOR_LABELS[flavor];
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">{label}</h4>
          <Button variant="ghost" size="sm" onClick={() => onCreate(flavor)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New profile
          </Button>
        </div>
        {profiles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No profiles yet. Create one to constrain {label.toLowerCase()}{" "}
            searches.
          </p>
        ) : (
          <div className="grid gap-2">
            {profiles.map((p) => (
              <DownloadProfileRow
                key={p.id}
                profile={p}
                onEdit={() => onEdit(p)}
                onSetDefault={() => onSetDefault(p.id)}
                onDelete={() => onDelete(p)}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);

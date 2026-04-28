"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import { trpc } from "@/lib/trpc/client";
import { AnimatedCollapse } from "./folder-animated-collapse";
import { PathInput } from "./folder-path-input";
import { cardInputCn } from "./folder-routing-rules-ui";

const SOURCE_BADGE_COLORS: Record<string, string> = {
  manual: "bg-muted text-muted-foreground",
  jellyfin: "bg-purple-500/10 text-purple-400",
  plex: "bg-amber-500/10 text-amber-400",
  download: "bg-blue-500/10 text-blue-400",
};

interface MediaPathsSectionProps {
  folderId: string;
  isLocal: boolean;
}

export function MediaPathsSection({
  folderId,
  isLocal,
}: MediaPathsSectionProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const mediaPaths = trpc.folder.listMediaPaths.useQuery(
    { folderId },
    { enabled: open },
  );

  const addPath = trpc.folder.addMediaPath.useMutation({
    onSuccess: () => {
      toast.success("Media path added");
      setNewPath("");
      setNewLabel("");
      setAdding(false);
      void utils.folder.listMediaPaths.invalidate({ folderId });
    },
    onError: (err) => toast.error(err.message),
  });

  const removePath = trpc.folder.removeMediaPath.useMutation({
    onSuccess: () => {
      toast.success("Media path removed");
      void utils.folder.listMediaPaths.invalidate({ folderId });
    },
    onError: (err) => toast.error(err.message),
  });

  const paths = mediaPaths.data ?? [];

  return (
    <div className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between py-1 text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-foreground">Additional paths</p>
          {paths.length > 0 && (
            <span className="text-xs text-muted-foreground">{paths.length}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatedCollapse open={open}>
        <div className="pt-2 space-y-2">
          {mediaPaths.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 rounded-lg bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          ) : paths.length > 0 ? (
            <div className="space-y-1.5">
              {paths.map((mp) => (
                <div
                  key={mp.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2"
                >
                  <p className="text-sm text-foreground truncate flex-1 font-mono">
                    {mp.path}
                  </p>
                  {mp.label && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {mp.label}
                    </span>
                  )}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "shrink-0 text-[10px] px-1.5 py-0 border-0",
                      SOURCE_BADGE_COLORS[mp.source ?? "manual"] ??
                        SOURCE_BADGE_COLORS.manual,
                    )}
                  >
                    {mp.source ?? "manual"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => removePath.mutate({ id: mp.id })}
                    disabled={removePath.isPending}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic py-1">
              If Jellyfin, Plex, or other servers use a different path for this
              same content, add it here so Canto can track it.
            </p>
          )}

          {/* Add path form */}
          {adding ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                {isLocal ? (
                  <PathInput
                    value={newPath}
                    onChange={setNewPath}
                    placeholder="/path/to/media"
                    className={cn(cardInputCn, "flex-1 h-8 text-xs")}
                  />
                ) : (
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/path/to/media"
                    className={cn(cardInputCn, "flex-1 h-8 text-xs")}
                    autoFocus
                  />
                )}
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className={cn(cardInputCn, "w-[120px] h-8 text-xs")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs rounded-lg"
                  disabled={!newPath || addPath.isPending}
                  onClick={() =>
                    addPath.mutate({
                      folderId,
                      path: newPath,
                      label: newLabel || undefined,
                      source: "manual",
                    })
                  }
                >
                  {addPath.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  Add
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setNewPath("");
                    setNewLabel("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-sm text-primary hover:text-primary transition-colors font-medium pt-1"
            >
              + Add path
            </button>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { trpc } from "@/lib/trpc/client";
import { cardInputCn } from "./folder-routing-rules-ui";

interface CustomFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  basePath: string;
  importMethod?: "local" | "remote";
}

export function CustomFolderDialog({
  open,
  onOpenChange,
  onCreated,
  basePath,
}: CustomFolderDialogProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  const createFolder = trpc.folder.create.useMutation({
    onSuccess: () => {
      toast.success("Library created");
      onCreated();
      onOpenChange(false);
      setName("");
      setCategory("");
    },
    onError: (err) => toast.error(err.message),
  });

  const slug = category || name.toLowerCase().replace(/\s+/g, "-");
  const root = basePath.replace(/\/+$/, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Library</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Folder name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 4K Movies"
              className={cardInputCn}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              qBittorrent category
            </label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. 4k-movies (optional)"
              className={cardInputCn}
            />
          </div>
          {root && slug && (
            <div className="rounded-xl bg-muted/30 px-4 py-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Generated paths
              </p>
              <p className="text-sm text-foreground font-mono">
                {root}/downloads/{slug}
              </p>
              <p className="text-sm text-foreground font-mono">
                {root}/media/{slug}
              </p>
            </div>
          )}
          <Button
            className="w-full rounded-xl"
            onClick={() =>
              createFolder.mutate({
                name,
                downloadPath:
                  root && slug ? `${root}/downloads/${slug}` : undefined,
                libraryPath:
                  root && slug ? `${root}/media/${slug}` : undefined,
                qbitCategory: category || undefined,
                priority: 10,
              })
            }
            disabled={!name || createFolder.isPending}
          >
            {createFolder.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

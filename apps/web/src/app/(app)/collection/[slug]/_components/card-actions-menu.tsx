"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canto/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import {
  ArrowRightLeft,
  EllipsisVertical,
  EyeOff,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { ResponsiveMenu } from "@/components/layout/responsive-menu";
import { SaveToListDialog } from "@/components/media/save-to-list-dialog";
import { MoveItemsDialog } from "./move-items-dialog";

interface CardActionsMenuProps {
  mediaId: string;
  mediaTitle: string;
  mediaExternalId: number | string;
  mediaProvider: string;
  mediaType: "movie" | "show";
  mediaPosterPath: string | null;
  currentListId: string;
  currentListName: string;
  canRemove: boolean;
  children: React.ReactNode;
  variant?: "grid" | "list";
}

export function CardActionsMenu({
  mediaId,
  mediaTitle,
  mediaExternalId,
  mediaProvider,
  mediaType,
  mediaPosterPath,
  currentListId,
  currentListName,
  canRemove,
  children,
  variant = "grid",
}: CardActionsMenuProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const utils = trpc.useUtils();

  const invalidate = (): void => {
    void utils.list.getBySlug.invalidate();
    void utils.list.getAll.invalidate();
    void utils.list.getAllCollectionItems.invalidate();
    void utils.list.isInLists.invalidate({ mediaId });
  };

  const removeMutation = trpc.list.removeItem.useMutation({
    onSuccess: () => {
      toast.success(`Removed "${mediaTitle}" from "${currentListName}"`);
      invalidate();
      setRemoveOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const moveMutation = trpc.list.moveItems.useMutation({
    onSuccess: () => {
      toast.success(`Moved "${mediaTitle}"`);
      invalidate();
      setMoveOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const hideMutation = trpc.userMedia.hideMedia.useMutation({
    onSuccess: () => {
      toast.success(`Hid "${mediaTitle}"`);
      invalidate();
      void utils.userMedia.getHiddenMedia.invalidate();
      void utils.userMedia.getHiddenIds.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleHide = (): void => {
    const externalIdNum =
      typeof mediaExternalId === "number" ? mediaExternalId : Number(mediaExternalId);
    if (!Number.isFinite(externalIdNum)) {
      toast.error("Cannot hide this item");
      return;
    }
    hideMutation.mutate({
      externalId: externalIdNum,
      provider: mediaProvider,
      type: mediaType,
      title: mediaTitle,
      posterPath: mediaPosterPath,
    });
  };

  return (
    <div className={cn("group/actions relative", variant === "list" && "flex")}>
      {children}

      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="end"
        sheetTitle={mediaTitle}
        trigger={
          <button
            type="button"
            aria-label={`Actions for ${mediaTitle}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={cn(
              "absolute z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              variant === "grid"
                ? "right-1.5 top-1.5"
                : "right-3 top-1/2 -translate-y-1/2",
            )}
          >
            <EllipsisVertical className="h-4 w-4" />
          </button>
        }
        desktopContent={
          <>
            {canRemove && (
              <DropdownMenuItem
                onClick={() => setRemoveOpen(true)}
                className="text-red-400 focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove from &quot;{currentListName}&quot;
              </DropdownMenuItem>
            )}
            {canRemove && (
              <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Move to…
              </DropdownMenuItem>
            )}
            {canRemove && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => setSaveOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Show all collections
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleHide} disabled={hideMutation.isPending}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide this title
            </DropdownMenuItem>
          </>
        }
        mobileContent={({ close }) => (
          <div className="flex flex-col gap-1">
            {canRemove && (
              <button
                type="button"
                onClick={() => {
                  close();
                  setRemoveOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Remove from &quot;{currentListName}&quot;
              </button>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => {
                  close();
                  setMoveOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-accent"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Move to…
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                close();
                setSaveOpen(true);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-accent"
            >
              <FolderOpen className="h-4 w-4" />
              Show all collections
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                handleHide();
              }}
              disabled={hideMutation.isPending}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              <EyeOff className="h-4 w-4" />
              Hide this title
            </button>
          </div>
        )}
      />

      <Dialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!open) setRemoveOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove from collection?</DialogTitle>
            <DialogDescription>
              &quot;{mediaTitle}&quot; will be removed from &quot;
              {currentListName}&quot;. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() =>
                removeMutation.mutate({ listId: currentListId, mediaId })
              }
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveItemsDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        sourceListId={currentListId}
        itemCount={1}
        pending={moveMutation.isPending}
        onPick={(targetListId) => {
          moveMutation.mutate({
            fromListId: currentListId,
            toListId: targetListId,
            mediaIds: [mediaId],
          });
        }}
      />

      <SaveToListDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        mediaId={mediaId}
      />
    </div>
  );
}

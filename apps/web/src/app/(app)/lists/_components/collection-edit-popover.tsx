"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@canto/ui/popover";
import { EllipsisVertical, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";

export function CollectionEditPopover({
  list,
  onDelete,
}: {
  list: { id: string; name: string; description: string | null };
  onDelete: (id: string, name: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [editDescription, setEditDescription] = useState(list.description ?? "");
  const utils = trpc.useUtils();

  const updateMutation = trpc.list.update.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      setOpen(false);
      toast.success("Collection updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (): void => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    const changes: { id: string; name?: string; description?: string } = { id: list.id };
    if (trimmedName !== list.name) changes.name = trimmedName;
    const trimmedDesc = editDescription.trim();
    if (trimmedDesc !== (list.description ?? "")) changes.description = trimmedDesc;
    if (!changes.name && !changes.description) { setOpen(false); return; }
    updateMutation.mutate(changes as { id: string; name?: string; description?: string });
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) { setEditName(list.name); setEditDescription(list.description ?? ""); } }}>
      <PopoverAnchor asChild>
        <button type="button" aria-label={`Edit ${list.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }} className="absolute right-1.5 top-1.5 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-accent hover:text-white">
          <EllipsisVertical className="h-5 w-5" />
        </button>
      </PopoverAnchor>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-3" onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-col">
          <p className="px-1 pb-3 text-base font-bold">Edit Collection</p>

          <div className="-mx-1 space-y-3 px-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Optional description" className="h-9 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <Button className="w-full rounded-xl" onClick={handleSave} disabled={!editName.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(list.id, list.name); }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete collection
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

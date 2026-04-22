"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Popover, PopoverAnchor, PopoverContent } from "@canto/ui/popover";
import { EllipsisVertical, Globe, Lock, Loader2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private", icon: Lock },
  { value: "shared", label: "Shared", icon: Users },
  { value: "public", label: "Public", icon: Globe },
] as const;

export function CollectionEditPopover({
  list,
  onDelete,
  onShare,
  triggerClassName,
}: {
  list: { id: string; name: string; description: string | null; visibility?: string };
  onDelete: (id: string, name: string) => void;
  onShare?: (id: string) => void;
  triggerClassName?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [editDescription, setEditDescription] = useState(list.description ?? "");
  const [editVisibility, setEditVisibility] = useState(list.visibility ?? "private");
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
    const changes: { id: string; name?: string; description?: string; visibility?: "public" | "private" | "shared" } = { id: list.id };
    if (trimmedName !== list.name) changes.name = trimmedName;
    const trimmedDesc = editDescription.trim();
    if (trimmedDesc !== (list.description ?? "")) changes.description = trimmedDesc;
    if (editVisibility !== (list.visibility ?? "private")) changes.visibility = editVisibility as "public" | "private" | "shared";
    if (!changes.name && !changes.description && !changes.visibility) { setOpen(false); return; }
    updateMutation.mutate(changes);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) { setEditName(list.name); setEditDescription(list.description ?? ""); setEditVisibility(list.visibility ?? "private"); } }}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={`Edit ${list.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className={cn(
            "z-10 flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
            triggerClassName ??
              "absolute right-1.5 top-1.5 text-white/80 hover:bg-accent hover:text-white",
          )}
        >
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Visibility</label>
              <Select value={editVisibility} onValueChange={setEditVisibility}>
                <SelectTrigger className="h-9 rounded-xl border-none bg-accent text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <Button className="w-full rounded-xl" onClick={handleSave} disabled={!editName.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>

          {onShare && (
            <button
              type="button"
              onClick={() => { setOpen(false); onShare(list.id); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Users className="h-4 w-4" />
              Manage members
            </button>
          )}

          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(list.id, list.name); }}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete collection
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

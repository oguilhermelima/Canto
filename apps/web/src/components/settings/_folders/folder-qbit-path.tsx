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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@canto/ui/select";
import { trpc } from "@/lib/trpc/client";

export interface QbitPathOption {
  category: string;
  savePath: string;
}

const CREATE_SENTINEL = "__create_new__";

/* -------------------------------------------------------------------------- */
/*  qBittorrent path select — dropdown-only with "create new" modal            */
/* -------------------------------------------------------------------------- */

interface QbitPathSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** When set, called with the category name whenever the selection changes. */
  onCategoryChange?: (category: string) => void;
  placeholder?: string;
  className?: string;
  options: QbitPathOption[];
  /** Show the category name under each option in the dropdown list. Trigger always shows path only. */
  showCategoryHint?: boolean;
}

export function QbitPathSelect({
  value,
  onChange,
  onCategoryChange,
  placeholder,
  className,
  options,
  showCategoryHint = true,
}: QbitPathSelectProps): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Ensure the current value appears as an option even if it's not in the
  // live qBit list (e.g. saved previously, category renamed, offline).
  const augmented: QbitPathOption[] =
    value && !options.some((o) => o.savePath === value)
      ? [{ category: "current", savePath: value }, ...options]
      : options;

  const handleSelect = (savePath: string): void => {
    onChange(savePath);
    if (onCategoryChange) {
      const match = augmented.find((o) => o.savePath === savePath);
      if (match && match.category !== "current") {
        onCategoryChange(match.category);
      }
    }
  };

  const handleCreated = (savePath: string, category: string): void => {
    onChange(savePath);
    if (onCategoryChange) onCategoryChange(category);
  };

  return (
    <>
      <Select
        value={value || undefined}
        onValueChange={(v) => {
          if (v === CREATE_SENTINEL) {
            setDialogOpen(true);
            return;
          }
          handleSelect(v);
        }}
      >
        <SelectTrigger className={className}>
          {value ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="truncate text-muted-foreground">
              {placeholder ?? "Select a qBittorrent path"}
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CREATE_SENTINEL}>
            <div className="flex items-center gap-2 text-primary">
              <Plus className="h-4 w-4" />
              <span className="font-medium">Create new qBittorrent path</span>
            </div>
          </SelectItem>
          {augmented.length > 0 && (
            <div className="my-1 h-px bg-border/40" aria-hidden="true" />
          )}
          {augmented.map((opt) => (
            <SelectItem
              key={`${opt.category}:${opt.savePath}`}
              value={opt.savePath}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{opt.savePath}</span>
                {showCategoryHint && opt.category !== "current" && (
                  <span className="truncate text-xs text-muted-foreground">
                    {opt.category}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CreateQbitCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Create qBit category dialog                                                */
/* -------------------------------------------------------------------------- */

interface CreateQbitCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (savePath: string, category: string) => void;
}

function CreateQbitCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateQbitCategoryDialogProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [savePath, setSavePath] = useState("");
  const utils = trpc.useUtils();

  const createCat = trpc.folder.createQbitCategory.useMutation({
    onSuccess: (data) => {
      toast.success(`Category "${data.name}" created and validated`);
      void utils.folder.qbitCategories.invalidate();
      onCreated(data.savePath, data.name);
      onOpenChange(false);
      setName("");
      setSavePath("");
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit =
    name.trim().length > 0 &&
    savePath.trim().length > 0 &&
    !createCat.isPending;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    createCat.mutate({ name: name.trim(), savePath: savePath.trim() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (createCat.isPending) return;
        onOpenChange(next);
        if (!next) {
          setName("");
          setSavePath("");
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Create qBittorrent category</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Category name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. movies"
              autoFocus
              disabled={createCat.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Save path
            </label>
            <Input
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder="/data/downloads/movies"
              disabled={createCat.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Must be an absolute path writable by the qBittorrent server. The
              category is validated immediately — invalid paths are rolled back.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createCat.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {createCat.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating
                </>
              ) : (
                <>Create &amp; validate</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

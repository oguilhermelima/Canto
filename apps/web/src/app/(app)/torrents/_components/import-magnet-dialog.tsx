"use client";

import { Button } from "@canto/ui/button";
import { Textarea } from "@canto/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";

interface ImportMagnetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function ImportMagnetDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  isPending,
}: ImportMagnetDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Import magnetic link</DialogTitle>
          <DialogDescription>
            Paste a magnetic link to add this download to qBittorrent and Canto tracking.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="magnet:?xt=urn:btih:..."
          className="min-h-28 rounded-xl border-none bg-accent text-sm ring-0 focus-visible:ring-1 focus-visible:ring-primary/30"
        />
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            onClick={onSubmit}
            disabled={isPending || !value.trim()}
          >
            {isPending ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

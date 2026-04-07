"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { cn } from "@canto/ui/cn";

export interface ResolveTarget {
  id: string;
  title: string;
  action: "approved" | "rejected";
  media?: { type: string; externalId: number };
}

export function ResolveDialog({
  target,
  onClose,
  onResolve,
  isPending,
}: {
  target: ResolveTarget | null;
  onClose: () => void;
  onResolve: (id: string, status: "approved" | "rejected", adminNote?: string) => void;
  isPending: boolean;
}): React.JSX.Element {
  const [adminNote, setAdminNote] = useState("");

  const handleClose = (): void => {
    onClose();
    setAdminNote("");
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border bg-background">
        <DialogHeader>
          <DialogTitle>
            {target?.action === "approved" ? "Approve" : "Reject"} Request
          </DialogTitle>
          <DialogDescription>
            {target?.action === "approved"
              ? `Approve the download request for "${target.title}"?`
              : `Reject the download request for "${target?.title}"?`}
          </DialogDescription>
        </DialogHeader>
        <div className="py-1">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Note (optional)
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Add a note for the user..."
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className={cn(
              target?.action === "approved"
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-red-500 text-white hover:bg-red-600",
            )}
            onClick={() =>
              target &&
              onResolve(target.id, target.action, adminNote || undefined)
            }
            disabled={isPending}
          >
            {isPending
              ? "Saving..."
              : target?.action === "approved"
                ? "Approve"
                : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

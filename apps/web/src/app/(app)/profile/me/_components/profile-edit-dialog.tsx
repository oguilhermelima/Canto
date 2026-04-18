"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Loader2, Upload, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { fileToBase64 } from "~/lib/file-to-base64";

const MAX_HEADER_SIZE = 4 * 1024 * 1024; // 4MB

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBio: string | null | undefined;
  currentHeaderImage: string | null | undefined;
}

export function ProfileEditDialog({
  open,
  onOpenChange,
  currentBio,
  currentHeaderImage,
}: ProfileEditDialogProps): React.JSX.Element {
  const [bio, setBio] = useState(currentBio ?? "");
  const [headerPreview, setHeaderPreview] = useState<string | null>(currentHeaderImage ?? null);
  const [uploading, setUploading] = useState(false);

  // Sync state when dialog opens or props change
  useEffect(() => {
    if (open) {
      setBio(currentBio ?? "");
      setHeaderPreview(currentHeaderImage ?? null);
    }
  }, [open, currentBio, currentHeaderImage]);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const saveMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      onOpenChange(false);
      void utils.auth.getProfile.invalidate();
    },
    onError: () => toast.error("Failed to save"),
  });

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_HEADER_SIZE) {
      toast.error("File too large. Maximum size is 4MB");
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      setHeaderPreview(base64);
    } catch {
      toast.error("Failed to read image");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = (): void => {
    saveMutation.mutate({
      bio: bio.trim() || null,
      headerImage: headerPreview,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your bio and header image.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* Header image */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Header Image</label>
            {headerPreview ? (
              <div className="relative aspect-[3/1] overflow-hidden rounded-xl bg-muted">
                <Image src={headerPreview} alt="Header" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  onClick={() => setHeaderPreview(null)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex aspect-[3/1] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-foreground hover:bg-muted/50"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">Click to upload</span>
                  </div>
                )}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleHeaderUpload} />
            {headerPreview && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Change image
              </button>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself..."
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="rounded-xl">
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { cn } from "@canto/ui/cn";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";

const DEFAULT_AVATARS = [
  { name: "Bear", src: "/avatars/bear.svg" },
  { name: "Bear 2", src: "/avatars/bear2.svg" },
  { name: "Bunny", src: "/avatars/bunny.svg" },
  { name: "Dog", src: "/avatars/dog.svg" },
  { name: "Dog 2", src: "/avatars/dog2.svg" },
  { name: "Dog 3", src: "/avatars/dog3.svg" },
  { name: "Lion", src: "/avatars/lion.svg" },
  { name: "Pug", src: "/avatars/pug.svg" },
  { name: "Raccoon", src: "/avatars/raccoon.svg" },
];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function AvatarPickerDialog({
  open,
  onOpenChange,
  currentImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentImage: string | null | undefined;
}): React.JSX.Element {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectDefaultAvatar = async (src: string): Promise<void> => {
    setSaving(true);
    try {
      await authClient.updateUser({ image: src });
      toast.success("Avatar updated");
      onOpenChange(false);
      window.location.reload();
    } catch {
      toast.error("Failed to update avatar");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 2MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Upload failed");
      }

      toast.success("Avatar uploaded");
      onOpenChange(false);
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload avatar",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isProcessing = saving || uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Avatar</DialogTitle>
          <DialogDescription>
            Choose a default avatar or upload your own image (max 2MB).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2">
          {DEFAULT_AVATARS.map((avatar) => (
            <button
              key={avatar.src}
              type="button"
              disabled={isProcessing}
              onClick={() => void selectDefaultAvatar(avatar.src)}
              className={cn(
                "group relative flex items-center justify-center overflow-hidden rounded-xl border-2 p-2 transition-all hover:border-foreground hover:bg-muted/40",
                currentImage === avatar.src
                  ? "border-primary bg-primary/10"
                  : "border-border",
                isProcessing && "opacity-50",
              )}
            >
              <Image
                src={avatar.src}
                alt={avatar.name}
                width={80}
                height={80}
                className="h-20 w-20 rounded-lg"
              />
            </button>
          ))}
        </div>

        <div className="border-t border-border pt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void handleFileUpload(e)}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload Custom Photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

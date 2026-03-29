"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { toast } from "sonner";

interface LibraryButtonProps {
  /** Internal media ID (from DB). If provided, uses direct mutation. */
  mediaId?: string;
  /** External provider info. Used when mediaId is not available (e.g. from TMDB search). */
  externalId?: number | string;
  provider?: string;
  type?: "movie" | "show";
  /** Title for toast messages */
  title?: string;
  /** Whether the item is already in the library */
  inLibrary?: boolean;
  /** Redirect to /media/{id} after adding */
  redirectOnAdd?: boolean;
  /** Button size */
  size?: "sm" | "lg";
  /** Additional class names */
  className?: string;
  /** Called when remove is clicked (e.g. to open confirm dialog) */
  onRemoveClick?: () => void;
  /** Dark variant for use on backdrop images */
  variant?: "default" | "dark";
}

export function LibraryButton({
  mediaId,
  externalId,
  provider,
  type,
  title,
  inLibrary = false,
  redirectOnAdd = false,
  size = "sm",
  className,
  onRemoveClick,
  variant = "default",
}: LibraryButtonProps): React.JSX.Element {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const addMutation = trpc.media.addToLibrary.useMutation();
  const removeMutation = trpc.media.removeFromLibrary.useMutation();

  const handleAdd = async (): Promise<void> => {
    setPending(true);
    try {
      let id = mediaId;
      if (!id && externalId && provider && type) {
        const media = await utils.client.media.getByExternal.query({
          provider: provider as "tmdb" | "anilist" | "tvdb",
          externalId: Number(externalId),
          type,
        });
        id = media.id;
      }
      if (!id) return;
      await new Promise<void>((resolve, reject) => {
        addMutation.mutate({ id: id! }, {
          onSuccess: () => {
            void utils.library.list.invalidate();
            void utils.media.getById.invalidate();
            void utils.media.getByExternal.invalidate();
            void utils.media.recommendations.invalidate();
            toast.success(title ? `Added "${title}" to library` : "Added to library");
            if (redirectOnAdd) router.push(`/media/${id}`);
            resolve();
          },
          onError: (err) => reject(err),
        });
      });
    } catch {
      toast.error("Failed to add to library");
    } finally {
      setPending(false);
    }
  };

  const handleRemove = (): void => {
    if (onRemoveClick) {
      onRemoveClick();
      return;
    }
    if (!mediaId) return;
    setPending(true);
    removeMutation.mutate({ id: mediaId }, {
      onSuccess: () => {
        void utils.library.list.invalidate();
        void utils.media.getById.invalidate();
        void utils.media.getByExternal.invalidate();
        toast.success(title ? `Removed "${title}" from library` : "Removed from library");
        setPending(false);
      },
      onError: (err) => {
        toast.error(err.message);
        setPending(false);
      },
    });
  };

  const isLoading = pending;
  const btnSize = size === "lg" ? "h-11 px-6 text-sm" : "h-9 px-5 text-sm";

  if (inLibrary) {
    return (
      <button
        type="button"
        className={cn(
          "group/lib inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:opacity-50",
          btnSize,
          variant === "dark"
            ? "border border-green-500/30 bg-green-500/15 text-green-400 hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-400"
            : "border border-green-500/30 bg-green-500/10 text-green-500 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500",
          className,
        )}
        onClick={handleRemove}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 size={size === "lg" ? 16 : 14} className="animate-spin" />
        ) : (
          <>
            <Check size={size === "lg" ? 16 : 14} className="group-hover/lib:hidden" />
            <X size={size === "lg" ? 16 : 14} className="hidden group-hover/lib:block" />
          </>
        )}
        <span className="group-hover/lib:hidden">In Library</span>
        <span className="hidden group-hover/lib:block">Remove</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:opacity-50",
        btnSize,
        variant === "dark"
          ? "bg-white text-black hover:bg-white/90"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
      onClick={() => void handleAdd()}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 size={size === "lg" ? 16 : 14} className="animate-spin" />
      ) : (
        <Plus size={size === "lg" ? 16 : 14} />
      )}
      Add to Library
    </button>
  );
}

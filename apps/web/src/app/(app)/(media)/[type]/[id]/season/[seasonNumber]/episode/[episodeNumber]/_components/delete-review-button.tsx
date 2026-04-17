"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";

interface DeleteReviewButtonProps {
  mediaId: string;
  episodeId: string;
  onDelete: () => void;
}

export function DeleteReviewButton({
  mediaId,
  episodeId,
  onDelete,
}: DeleteReviewButtonProps): React.JSX.Element {
  const deleteMutation = trpc.userMedia.removeRating.useMutation({
    onSuccess: () => { onDelete(); toast.success("Review deleted"); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-400 hover:bg-muted"
      onClick={() => deleteMutation.mutate({ mediaId, episodeId })}
      disabled={deleteMutation.isPending}
    >
      <Trash2 size={14} />
      Delete
    </button>
  );
}

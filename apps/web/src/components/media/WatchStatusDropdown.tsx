"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { trpc } from "~/lib/trpc/client";

type TrackingStatus = "none" | "planned" | "watching" | "completed" | "dropped";

const STATUS_OPTIONS: Array<{ value: TrackingStatus; label: string }> = [
  { value: "none", label: "No Status" },
  { value: "planned", label: "Plan to Watch" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

interface WatchStatusDropdownProps {
  mediaId: string;
  initialStatus?: string | null;
}

export function WatchStatusDropdown({
  mediaId,
  initialStatus,
}: WatchStatusDropdownProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const updateMutation = trpc.userMedia.updateState.useMutation({
    onSuccess: () => {
      void utils.userMedia.getState.invalidate({ mediaId });
    },
  });

  const status = initialStatus ?? "none";

  const handleStatusChange = (value: string) => {
    updateMutation.mutate({
      mediaId,
      trackingStatus: value as TrackingStatus,
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider ml-1">
        Watch Status
      </label>
      <Select value={status} onValueChange={handleStatusChange}>
        <SelectTrigger className="h-10 w-48 rounded-xl border-none bg-white/10 text-sm backdrop-blur-sm transition-colors hover:bg-white/15 focus:ring-0">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

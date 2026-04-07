export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-500" },
  approved: { label: "Approved", className: "bg-blue-500/15 text-blue-500" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-500" },
  downloaded: { label: "Downloaded", className: "bg-green-500/15 text-green-500" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

export const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "downloaded", label: "Downloaded" },
] as const;

export const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV Shows" },
] as const;

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

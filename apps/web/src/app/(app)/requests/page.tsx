"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { X, Check, Film, Tv, Search, Clock, User, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "~/components/layout/page-header";
import { StateMessage } from "~/components/layout/state-message";
import { TabBar } from "~/components/layout/tab-bar";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";

/* ─── Status config ─── */

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-500" },
  approved: { label: "Approved", className: "bg-blue-500/15 text-blue-500" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-500" },
  downloaded: { label: "Downloaded", className: "bg-green-500/15 text-green-500" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "downloaded", label: "Downloaded" },
] as const;

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV Shows" },
] as const;

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Page ─── */

export default function RequestsPage(): React.JSX.Element {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");

  const [resolveTarget, setResolveTarget] = useState<{
    id: string;
    title: string;
    action: "approved" | "rejected";
    mediaId?: string;
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    document.title = "Requests — Canto";
  }, []);

  const utils = trpc.useUtils();
  const { data: requests, isLoading, isError } = trpc.request.list.useQuery();

  const cancelMutation = trpc.request.cancel.useMutation({
    onSuccess: () => {
      void utils.request.list.invalidate();
      toast.success("Request cancelled");
    },
    onError: (err) => toast.error(err.message),
  });

  const resolveMutation = trpc.request.resolve.useMutation({
    onSuccess: (_, vars) => {
      void utils.request.list.invalidate();
      const mediaId = resolveTarget?.mediaId;
      setResolveTarget(null);
      setAdminNote("");
      if (vars.status === "approved" && mediaId) {
        toast.success("Request approved", {
          action: {
            label: "Go to media",
            onClick: () => router.push(`/media/${mediaId}`),
          },
        });
      } else {
        toast.success(vars.status === "approved" ? "Request approved" : "Request rejected");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!requests) return [];
    return requests
      .filter((req) => {
        if (statusFilter !== "all" && req.status !== statusFilter) return false;
        if (typeFilter !== "all" && req.media?.type !== typeFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const title = (req.media?.title ?? "").toLowerCase();
          const userName = ("user" in req && req.user != null)
            ? ((req.user as { name: string | null }).name ?? (req.user as { email: string }).email).toLowerCase()
            : "";
          if (!title.includes(q) && !userName.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "title") {
          return (a.media?.title ?? "").localeCompare(b.media?.title ?? "");
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [requests, statusFilter, typeFilter, searchQuery, sortBy]);

  const counts = useMemo(() => {
    if (!requests) return { all: 0, pending: 0, approved: 0, rejected: 0, downloaded: 0 };
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      downloaded: requests.filter((r) => r.status === "downloaded").length,
    };
  }, [requests]);

  return (
    <div className="w-full">
      <PageHeader
        title="Requests"
        subtitle={isAdmin ? "Manage download requests from all users." : "Your download requests."}
      />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Tabs */}
        <TabBar
          tabs={STATUS_TABS.map(({ value, label }) => ({
            value,
            label,
            count: counts[value as keyof typeof counts],
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        {/* Filter bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-xl pl-9 text-sm"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1">
            {TYPE_TABS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setTypeFilter(value)}
                className={cn(
                  "h-10 rounded-xl px-4 text-sm font-medium transition-colors",
                  typeFilter === value
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <button
            onClick={() => setSortBy((s) => s === "date" ? "title" : "date")}
            className="flex h-10 items-center gap-2 rounded-xl px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpDown size={14} />
            {sortBy === "date" ? "Newest first" : "A–Z"}
          </button>
        </div>

        {/* Content */}
        {isError ? (
          <StateMessage preset="error" onRetry={() => void utils.request.list.invalidate()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-5 rounded-2xl bg-muted/40 p-5">
                <Skeleton className="h-20 w-20 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          requests && requests.length > 0 ? (
            <StateMessage preset="emptyFiltered" />
          ) : (
            <StateMessage preset={isAdmin ? "emptyRequests" : "emptyRequestsUser"} />
          )
        ) : (
          <div className="space-y-3 pb-8">
            {filtered.map((req) => {
              const media = req.media;
              const isPending = req.status === "pending";
              const statusConfig = STATUS_STYLES[req.status];

              return (
                <div
                  key={req.id}
                  className="overflow-hidden rounded-2xl bg-muted/40"
                >
                  <div className="flex items-center gap-5 p-5 sm:p-6">
                    {/* Poster */}
                    <Link
                      href={media?.id ? `/media/${media.id}` : "#"}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-24 sm:w-24"
                    >
                      {media?.posterPath ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w342${media.posterPath}`}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {media?.type === "show" ? <Tv size={20} className="text-muted-foreground/30" /> : <Film size={20} className="text-muted-foreground/30" />}
                        </div>
                      )}
                    </Link>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={media?.id ? `/media/${media.id}` : "#"} className="truncate text-base font-semibold text-foreground hover:underline sm:text-lg">
                          {media?.title ?? "Unknown media"}
                        </Link>
                        {statusConfig && (
                          <span className={cn("shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-semibold", statusConfig.className)}>
                            {statusConfig.label}
                          </span>
                        )}
                      </div>

                      {/* Meta row */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {media?.year && (
                          <span>{media.year} · {media.type === "show" ? "TV Show" : "Movie"}</span>
                        )}
                        {isAdmin && "user" in req && req.user != null && (
                          <span className="flex items-center gap-1.5">
                            <User size={13} className="text-muted-foreground/50" />
                            {(req.user as { name: string | null }).name ?? (req.user as { email: string }).email}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Clock size={13} className="text-muted-foreground/50" />
                          {formatDate(req.createdAt)}
                        </span>
                      </div>

                      {/* Notes */}
                      {req.note && (
                        <p className="mt-2 text-sm text-muted-foreground">{req.note}</p>
                      )}
                      {req.adminNote && (
                        <p className="mt-1 text-sm italic text-muted-foreground/70">Admin: {req.adminNote}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      {isPending && isAdmin && (
                        <>
                          <button
                            onClick={() => setResolveTarget({
                              id: req.id,
                              title: media?.title ?? "this request",
                              action: "approved",
                              mediaId: media?.id,
                            })}
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-500"
                            title="Approve"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => setResolveTarget({
                              id: req.id,
                              title: media?.title ?? "this request",
                              action: "rejected",
                              mediaId: media?.id,
                            })}
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500"
                            title="Reject"
                          >
                            <X size={18} />
                          </button>
                        </>
                      )}
                      {isPending && !isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => cancelMutation.mutate({ id: req.id })}
                          disabled={cancelMutation.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length > 0 && <StateMessage preset="endOfItems" inline />}
          </div>
        )}
      </div>

      {/* Admin resolve dialog */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) { setResolveTarget(null); setAdminNote(""); }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-border bg-background">
          <DialogHeader>
            <DialogTitle>
              {resolveTarget?.action === "approved" ? "Approve" : "Reject"} Request
            </DialogTitle>
            <DialogDescription>
              {resolveTarget?.action === "approved"
                ? `Approve the download request for "${resolveTarget.title}"?`
                : `Reject the download request for "${resolveTarget?.title}"?`}
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
            <Button variant="outline" onClick={() => setResolveTarget(null)}>
              Cancel
            </Button>
            <Button
              className={cn(
                resolveTarget?.action === "approved"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-red-500 text-white hover:bg-red-600",
              )}
              onClick={() =>
                resolveTarget &&
                resolveMutation.mutate({
                  id: resolveTarget.id,
                  status: resolveTarget.action,
                  adminNote: adminNote || undefined,
                })
              }
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending
                ? "Saving..."
                : resolveTarget?.action === "approved"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Inbox, X, Check, Film, Tv } from "lucide-react";
import { PageHeader } from "~/components/layout/page-header";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";

/* ─── Status badge config ─── */

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-600",
  approved: "bg-blue-500/15 text-blue-600",
  rejected: "bg-red-500/15 text-red-600",
  downloaded: "bg-green-500/15 text-green-600",
  cancelled: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        "shrink-0 rounded-xl px-2.5 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

/* ─── Date formatter ─── */

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Page ─── */

export default function RequestsPage(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [resolveTarget, setResolveTarget] = useState<{
    id: string;
    title: string;
    action: "approved" | "rejected";
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    document.title = "Requests — Canto";
  }, []);

  const utils = trpc.useUtils();
  const { data: requests, isLoading } = trpc.request.list.useQuery();

  const cancelMutation = trpc.request.cancel.useMutation({
    onSuccess: () => void utils.request.list.invalidate(),
  });

  const resolveMutation = trpc.request.resolve.useMutation({
    onSuccess: () => {
      void utils.request.list.invalidate();
      setResolveTarget(null);
      setAdminNote("");
    },
  });

  function openResolveDialog(
    id: string,
    title: string,
    action: "approved" | "rejected",
  ): void {
    setResolveTarget({ id, title, action });
    setAdminNote("");
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Requests"
        subtitle={
          isAdmin
            ? "Manage download requests from all users."
            : "Your download requests."
        }
      />

      <div className="px-4 pb-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Loading */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-xl border border-border bg-card p-4"
              >
                <Skeleton className="h-24 w-16 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !requests || requests.length === 0 ? (
          /* Empty state */
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Inbox className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
              <h2 className="mb-2 text-lg font-medium text-foreground">
                No requests
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                {isAdmin
                  ? "No download requests from users yet."
                  : "You haven't made any download requests yet. Request downloads from a media detail page."}
              </p>
            </div>
          </div>
        ) : (
          /* Request list */
          <div className="space-y-3">
            {requests.map((req) => {
              const media = req.media;
              const isPending = req.status === "pending";

              return (
                <div
                  key={req.id}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
                    {/* Poster */}
                    <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-20">
                      {media?.posterPath ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w185${media.posterPath}`}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {media?.type === "show" ? (
                            <Tv
                              size={18}
                              className="text-muted-foreground/30"
                            />
                          ) : (
                            <Film
                              size={18}
                              className="text-muted-foreground/30"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground sm:text-base">
                          {media?.title ?? "Unknown media"}
                        </h3>
                        <StatusBadge status={req.status} />
                      </div>

                      {media?.year && (
                        <p className="text-xs text-muted-foreground/60">
                          {media.year} &middot;{" "}
                          {media.type === "show" ? "TV Show" : "Movie"}
                        </p>
                      )}

                      {isAdmin && "user" in req && req.user != null && (
                        <p className="text-xs text-muted-foreground">
                          Requested by{" "}
                          <span className="font-medium text-foreground">
                            {(req.user as { name: string | null }).name ?? (req.user as { email: string }).email}
                          </span>
                        </p>
                      )}

                      {req.note && (
                        <p className="text-sm text-muted-foreground">
                          {req.note}
                        </p>
                      )}

                      {req.adminNote && (
                        <p className="text-sm text-muted-foreground/70 italic">
                          Admin: {req.adminNote}
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground/50">
                        {formatDate(req.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-start gap-2">
                      {isPending && isAdmin && (
                        <>
                          <button
                            onClick={() =>
                              openResolveDialog(
                                req.id,
                                media?.title ?? "this request",
                                "approved",
                              )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-500"
                            title="Approve"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() =>
                              openResolveDialog(
                                req.id,
                                media?.title ?? "this request",
                                "rejected",
                              )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500"
                            title="Reject"
                          >
                            <X size={16} />
                          </button>
                        </>
                      )}

                      {isPending && !isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() =>
                            cancelMutation.mutate({ id: req.id })
                          }
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
          </div>
        )}
      </div>

      {/* Admin resolve dialog */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setAdminNote("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-border bg-background">
          <DialogHeader>
            <DialogTitle>
              {resolveTarget?.action === "approved" ? "Approve" : "Reject"}{" "}
              Request
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
            <Button
              variant="outline"
              onClick={() => setResolveTarget(null)}
            >
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

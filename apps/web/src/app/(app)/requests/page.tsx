"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import { Skeleton } from "@canto/ui/skeleton";
import { Search, ArrowUpDown, Loader2 } from "lucide-react";
import { PageHeader } from "~/components/layout/page-header";
import { StateMessage } from "~/components/layout/state-message";
import { TabBar } from "~/components/layout/tab-bar";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { mediaDetailHref } from "~/lib/media-href";
import { STATUS_TABS, TYPE_TABS } from "./_components/constants";
import { RequestCard } from "./_components/request-card";
import { ResolveDialog  } from "./_components/resolve-dialog";
import type {ResolveTarget} from "./_components/resolve-dialog";

export default function RequestsPage(): React.JSX.Element {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(null);

  useDocumentTitle("Requests");

  const PAGE_SIZE = 20;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.request.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const currentOffset = (lastPageParam as number) ?? 0;
        const nextOffset = currentOffset + PAGE_SIZE;
        if (nextOffset >= lastPage.total) return undefined;
        return nextOffset;
      },
      initialCursor: 0,
    },
  );

  const requests = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
      const targetMedia = resolveTarget?.media;
      setResolveTarget(null);
      if (vars.status === "approved" && targetMedia) {
        toast.success("Request approved", {
          action: {
            label: "Go to media",
            onClick: () => router.push(mediaDetailHref(targetMedia)),
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
            {filtered.map((req) => (
              <RequestCard
                key={req.id}
                req={req as Parameters<typeof RequestCard>[0]["req"]}
                isAdmin={isAdmin}
                onApprove={(id, title, media) =>
                  setResolveTarget({ id, title, action: "approved", media })
                }
                onReject={(id, title, media) =>
                  setResolveTarget({ id, title, action: "rejected", media })
                }
                onCancel={(id) => cancelMutation.mutate({ id })}
                cancelPending={cancelMutation.isPending}
              />
            ))}

            <div ref={sentinelRef} className="h-1" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasNextPage && !isFetchingNextPage && filtered.length > 0 && (
              <StateMessage preset="endOfItems" inline />
            )}
          </div>
        )}
      </div>

      <ResolveDialog
        target={resolveTarget}
        onClose={() => setResolveTarget(null)}
        onResolve={(id, status, adminNote) =>
          resolveMutation.mutate({ id, status, adminNote })
        }
        isPending={resolveMutation.isPending}
      />
    </div>
  );
}

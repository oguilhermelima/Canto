"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Bookmark,
  Eye,
  FolderOpen,
  Loader2,
  Plus,
  Server,
  Settings2,
  Trash2,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { MediaGrid } from "~/components/media/media-grid";
import {
  MediaFilterSidebar,
  type FilterState,
} from "~/components/media/media-filter-sidebar";

const TABS = [
  { value: "watchlist", label: "Watchlist", icon: Eye },
  { value: "collections", label: "Collections", icon: FolderOpen },
  { value: "server", label: "Server Library", icon: Server },
];

const DEFAULT_FILTERS: FilterState = {
  sortBy: "popularity",
  sortOrder: "desc",
  genres: new Set(),
  yearMin: "",
  yearMax: "",
  status: "",
  runtimeMax: "",
  contentRating: "",
  scoreMin: [0],
  language: "",
  provider: "",
};

type Tab = "watchlist" | "collections" | "server";

/* ─── Filter Button ─── */

function FilterButton({
  active,
  disabled,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-all",
        disabled
          ? "cursor-not-allowed opacity-30"
          : active
            ? "bg-foreground text-background"
            : "bg-muted/60 text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      <Settings2
        className={cn(
          "h-4 w-4 transition-transform duration-300",
          active && "rotate-90",
        )}
      />
    </button>
  );
}

/* ─── Media List Tab (Watchlist / Server Library) ─── */

function MediaListTab({
  slug,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  showFilters,
  filters,
}: {
  slug: string;
  emptyIcon: React.ElementType;
  emptyTitle: string;
  emptyDescription: string;
  showFilters: boolean;
  filters: FilterState;
}): React.JSX.Element {
  const { data, isLoading } = trpc.list.getBySlug.useQuery({
    slug,
    limit: 100,
  });

  const items = useMemo(() => {
    const all =
      data?.items.map((item) => ({
        id: item.media.id,
        type: item.media.type as "movie" | "show",
        title: item.media.title,
        posterPath: item.media.posterPath,
        year: item.media.year ?? undefined,
        voteAverage: item.media.voteAverage ?? undefined,
      })) ?? [];

    // Filter
    const filtered = all.filter((r) => {
      if (r.year) {
        const yearMin = filters.yearMin ? Number(filters.yearMin) : 0;
        const yearMax = filters.yearMax ? Number(filters.yearMax) : 9999;
        if (r.year < yearMin || r.year > yearMax) return false;
      }
      const minScore = filters.scoreMin[0] ?? 0;
      if (minScore > 0 && r.voteAverage != null && r.voteAverage < minScore)
        return false;
      return true;
    });

    // Sort
    const { sortBy, sortOrder } = filters;
    if (sortBy && sortBy !== "popularity") {
      filtered.sort((a, b) => {
        let cmp = 0;
        if (sortBy === "name") cmp = a.title.localeCompare(b.title);
        else if (sortBy === "year") cmp = (a.year ?? 0) - (b.year ?? 0);
        else if (sortBy === "rating") cmp = (a.voteAverage ?? 0) - (b.voteAverage ?? 0);
        return sortOrder === "desc" ? -cmp : cmp;
      });
    }

    return filtered;
  }, [data, filters]);

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <EmptyIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
          <p className="text-lg font-medium text-muted-foreground">
            {emptyTitle}
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {emptyDescription}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Discover Media
          </Link>
        </div>
      </div>
    );
  }

  return <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />;
}

/* ─── Collections Tab ─── */

function CollectionsTab(): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: lists, isLoading } = trpc.list.getAll.useQuery();

  const createMutation = trpc.list.create.useMutation({
    onSuccess: (newList) => {
      void utils.list.getAll.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("Collection created");
      router.push(`/lists/${newList.slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.list.delete.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      setDeleteTarget(null);
      toast.success("Collection deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = (): void => {
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const [cols, setCols] = useState(3);
  useEffect(() => {
    const update = (): void => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(5);
      else if (w >= 1024) setCols(4);
      else if (w >= 640) setCols(3);
      else setCols(2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const visibleCount = showAll ? Infinity : cols * 2 - 1;
  const customLists = lists?.filter((l) => l.type === "custom") ?? [];

  return (
    <>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : customLists.length === 0 && !showAll ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border/50">
          <div className="text-center">
            <Bookmark className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No collections yet</p>
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Collection
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {customLists.slice(0, visibleCount).map((l) => {
              const posters = l.previewPosters ?? [];
              return (
                <Link key={l.id} href={`/lists/${l.slug}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted transition-transform duration-200 hover:scale-[1.03]">
                  {posters.length >= 4 ? (
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                      {posters.slice(0, 4).map((p, i) => (
                        <Image key={i} src={`https://image.tmdb.org/t/p/w500${p}`} alt="" width={250} height={188} className="h-full w-full object-cover" />
                      ))}
                    </div>
                  ) : posters.length >= 2 ? (
                    <div className={cn("grid h-full w-full gap-0.5", posters.length === 2 && "grid-cols-2", posters.length === 3 && "grid-cols-2 grid-rows-2")}>
                      {posters.map((p, i) => (
                        <Image key={i} src={`https://image.tmdb.org/t/p/w500${p}`} alt="" width={250} height={188} className={cn("h-full w-full object-cover", posters.length === 3 && i === 0 && "row-span-2")} />
                      ))}
                    </div>
                  ) : posters.length === 1 ? (
                    <div className="relative h-full w-full">
                      <Image src={`https://image.tmdb.org/t/p/w92${posters[0]}`} alt="" fill className="scale-110 object-cover blur-2xl brightness-50" />
                      <div className="relative flex h-full w-full items-center justify-center">
                        <Image src={`https://image.tmdb.org/t/p/w500${posters[0]}`} alt="" width={120} height={180} className="h-[85%] w-auto rounded-md object-cover shadow-xl" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
                      <Bookmark className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/10" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-14">
                    <h3 className="truncate text-base font-semibold text-white">{l.name}</h3>
                    <p className="text-sm text-white/60">{l.itemCount} {l.itemCount === 1 ? "item" : "items"}</p>
                  </div>
                  <button type="button" aria-label={`Delete ${l.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: l.id, name: l.name }); }} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white/70 opacity-0 backdrop-blur-sm transition-all hover:bg-red-500/80 hover:text-white group-hover:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Link>
              );
            })}
            {(showAll || customLists.length < visibleCount + 1) && (
              <button type="button" onClick={() => setCreateOpen(true)} className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 bg-muted/30 transition-all duration-200 hover:scale-[1.03] hover:border-foreground/20 hover:bg-muted/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 transition-colors group-hover:bg-foreground/10">
                  <Plus className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">New Collection</span>
              </button>
            )}
          </div>
          {customLists.length > visibleCount && !showAll && (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setShowAll(true)}>
                See all collections ({customLists.length})
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>Create a collection to organize your movies and shows.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend Binges" className="h-10" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Description <span className="text-muted-foreground/50">(optional)</span></label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this collection for?" className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-500 text-white hover:bg-red-600" onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Page ─── */

export default function LibraryPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "watchlist";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    document.title = "Library — Canto";
  }, []);

  const handleTabChange = (value: string): void => {
    const tab = value as Tab;
    setActiveTab(tab);
    if (tab === "collections") {
      setShowFilters(false);
      setFilters(DEFAULT_FILTERS);
    }
    const params = new URLSearchParams();
    if (tab !== "watchlist") params.set("tab", tab);
    router.replace(`/lists${params.size > 0 ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  const handleFilterChange = useCallback((f: FilterState) => setFilters(f), []);
  const handleFilterReset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const hasFilters = activeTab === "watchlist" || activeTab === "server";

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Library"
        subtitle="Your watchlist, collections, and saved media."
        className={cn(
          "transition-[margin] duration-300 ease-in-out",
          showFilters && hasFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      />

      {/* Tab Bar */}
      <div
        className={cn(
          "px-4 pt-6 pb-8 transition-[margin] duration-300 ease-in-out md:px-8 lg:px-12 xl:px-16 2xl:px-24",
          showFilters && hasFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      >
        <TabBar
          tabs={TABS}
          value={activeTab}
          onChange={handleTabChange}
          leading={
            <FilterButton
              active={showFilters && hasFilters}
              disabled={!hasFilters}
              onClick={() => setShowFilters((v) => !v)}
            />
          }
        />
      </div>

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Filter Sidebar */}
        {hasFilters && (
          <div
            className={cn(
              "fixed top-16 z-[35] hidden transition-[left,opacity] duration-300 ease-in-out md:block",
              showFilters
                ? "left-4 opacity-100 md:left-8 lg:left-12 xl:left-16 2xl:left-24"
                : "-left-72 opacity-0",
            )}
            style={{ width: "16rem", height: "calc(100vh - 5rem)", top: "5rem" }}
          >
            <MediaFilterSidebar
              mediaType="all"
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleFilterReset}
            />
          </div>
        )}

        {/* Content — shifts right when sidebar is open */}
        <div
          className={cn(
            "transition-[margin] duration-300 ease-in-out",
            showFilters && hasFilters && "md:ml-[17rem] lg:ml-[19rem]",
          )}
        >
          {activeTab === "watchlist" && (
            <MediaListTab
              slug="watchlist"
              emptyIcon={Bookmark}
              emptyTitle="Your watchlist is empty"
              emptyDescription="Browse media and save items to watch later."
              showFilters={showFilters}
              filters={filters}
            />
          )}
          {activeTab === "collections" && <CollectionsTab />}
          {activeTab === "server" && (
            <MediaListTab
              slug="server-library"
              emptyIcon={Server}
              emptyTitle="Server library is empty"
              emptyDescription="Media downloaded to the server will appear here."
              showFilters={showFilters}
              filters={filters}
            />
          )}
        </div>
      </div>
    </div>
  );
}

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
import { Popover, PopoverAnchor, PopoverContent } from "@canto/ui/popover";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  ChevronDown,
  EllipsisVertical,
  Eye,
  FolderOpen,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Server,
  Settings2,
  Trash2,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { PageHeader } from "~/components/layout/page-header";
import { StateMessage } from "~/components/layout/state-message";
import { TabBar } from "~/components/layout/tab-bar";
import { MediaGrid } from "~/components/media/media-grid";
import {
  FilterSidebar,
  type FilterOutput,
} from "~/components/media/filter-sidebar";

const TABS = [
  { value: "watchlist", label: "Watchlist", icon: Eye },
  { value: "collections", label: "Collections", icon: FolderOpen },
  { value: "server", label: "Server Library", icon: Server },
];

type Tab = "watchlist" | "collections" | "server";

/* ─── Filter Button ─── */

function FilterButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-all",
        active
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
  preset,
  showFilters,
  filters,
}: {
  slug: string;
  preset: "emptyWatchlist" | "emptyServerLibrary";
  showFilters: boolean;
  filters: FilterOutput;
}): React.JSX.Element {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = trpc.list.getBySlug.useQuery({
    slug,
    limit: 100,
    genreIds: filters.genreIds,
    genreMode: filters.genreMode,
    language: filters.language,
    scoreMin: filters.scoreMin,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    runtimeMin: filters.runtimeMin,
    runtimeMax: filters.runtimeMax,
    certification: filters.certification,
    status: filters.status,
    sortBy: filters.sortBy,
    watchProviders: filters.watchProviders,
    watchRegion: filters.watchRegion,
  });

  const items = useMemo(() =>
    data?.items.map((item) => ({
      id: item.media.id,
      type: item.media.type as "movie" | "show",
      title: item.media.title,
      posterPath: item.media.posterPath,
      year: item.media.year ?? undefined,
      voteAverage: item.media.voteAverage ?? undefined,
    })) ?? [],
  [data]);

  if (isError) {
    return <StateMessage preset="error" onRetry={() => void refetch()} />;
  }

  if (!isLoading && items.length === 0) {
    return (
      <StateMessage
        preset={preset}
        action={{ label: "Discover Media", onClick: () => router.push("/") }}
      />
    );
  }

  return <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />;
}

/* ─── Collection Filter Sidebar ─── */

type CollectionSort = "name" | "date";

export interface CollectionFilterState {
  sortBy: CollectionSort;
  sortOrder: "asc" | "desc";
  searchQuery: string;
}

const DEFAULT_COLLECTION_FILTERS: CollectionFilterState = {
  sortBy: "date",
  sortOrder: "desc",
  searchQuery: "",
};

const COLLECTION_SORT_OPTIONS = [
  { value: "date", label: "Date Created" },
  { value: "name", label: "Name" },
];


function CollectionFilterSidebar({
  filters,
  onChange,
  onReset,
}: {
  filters: CollectionFilterState;
  onChange: (filters: CollectionFilterState) => void;
  onReset: () => void;
}): React.JSX.Element {
  const update = (partial: Partial<CollectionFilterState>): void => {
    onChange({ ...filters, ...partial });
  };

  const isDesc = filters.sortOrder === "desc";
  const SortIcon = isDesc ? ArrowDown : ArrowUp;

  return (
    <div className="pt-2">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Filter</h2>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={onReset}
        >
          <RotateCcw size={13} />
          Clear
        </button>
      </div>

      <div className="flex flex-col">
        {/* Search */}
        <div className="border-b border-border/40 py-4">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between"
          >
            <span className="text-[15px] font-semibold text-foreground">Search</span>
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
            <Input
              value={filters.searchQuery}
              onChange={(e) => update({ searchQuery: e.target.value })}
              placeholder="Search collections..."
              className="!h-9 !rounded-xl !border-0 !bg-accent !pl-9 !text-[13px] !font-medium !text-foreground/70 !placeholder:text-foreground/30"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="border-b border-border/40 py-4 last:border-b-0">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between"
          >
            <span className="text-[15px] font-semibold text-foreground">Sort By</span>
          </button>
          <div className="flex items-center gap-2">
            <select
              value={filters.sortBy}
              onChange={(e) => update({ sortBy: e.target.value as CollectionSort })}
              className="h-9 flex-1 appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground/70 outline-none"
            >
              {COLLECTION_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-0 bg-accent text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => update({ sortOrder: isDesc ? "asc" : "desc" })}
            >
              <SortIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Collections Tab ─── */

function CollectionEditPopover({
  list,
  onDelete,
}: {
  list: { id: string; name: string; description: string | null };
  onDelete: (id: string, name: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [editDescription, setEditDescription] = useState(list.description ?? "");
  const utils = trpc.useUtils();

  const updateMutation = trpc.list.update.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      setOpen(false);
      toast.success("Collection updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (): void => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    const changes: { id: string; name?: string; description?: string } = { id: list.id };
    if (trimmedName !== list.name) changes.name = trimmedName;
    const trimmedDesc = editDescription.trim();
    if (trimmedDesc !== (list.description ?? "")) changes.description = trimmedDesc;
    if (!changes.name && !changes.description) { setOpen(false); return; }
    updateMutation.mutate(changes as { id: string; name?: string; description?: string });
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) { setEditName(list.name); setEditDescription(list.description ?? ""); } }}>
      <PopoverAnchor asChild>
        <button type="button" aria-label={`Edit ${list.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }} className="absolute right-1.5 top-1.5 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-accent hover:text-white">
          <EllipsisVertical className="h-5 w-5" />
        </button>
      </PopoverAnchor>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-3" onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-col">
          <p className="px-1 pb-3 text-base font-bold">Edit Collection</p>

          <div className="-mx-1 space-y-3 px-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Optional description" className="h-9 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <Button className="w-full rounded-xl" onClick={handleSave} disabled={!editName.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(list.id, list.name); }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete collection
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CollectionsTab({
  filters,
}: {
  filters: CollectionFilterState;
}): React.JSX.Element {
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
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();

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
  const customLists = useMemo(() => {
    let result = lists?.filter((l) => l.type === "custom") ?? [];

    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }

    const dir = filters.sortOrder === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      if (filters.sortBy === "name") return dir * a.name.localeCompare(b.name);
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });

    return result;
  }, [lists, filters]);

  return (
    <>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <StateMessage preset="error" onRetry={() => void refetch()} />
      ) : (lists?.filter((l) => l.type === "custom") ?? []).length === 0 ? (
        <StateMessage
          preset="emptyCollections"
          action={{ label: "New Collection", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {customLists.slice(0, visibleCount).map((l) => {
              const posters = l.previewPosters ?? [];
              return (
                <Link key={l.id} href={`/lists/${l.slug}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted transition-transform duration-200 hover:scale-[1.03]">
                  {posters.length >= 4 ? (
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                      {posters.slice(0, 4).map((p, i) => (
                        <Image key={i} src={`https://image.tmdb.org/t/p/w780${p}`} alt="" width={250} height={188} className="h-full w-full object-cover" />
                      ))}
                    </div>
                  ) : posters.length >= 2 ? (
                    <div className={cn("grid h-full w-full gap-0.5", posters.length === 2 && "grid-cols-2", posters.length === 3 && "grid-cols-2 grid-rows-2")}>
                      {posters.map((p, i) => (
                        <Image key={i} src={`https://image.tmdb.org/t/p/w780${p}`} alt="" width={250} height={188} className={cn("h-full w-full object-cover", posters.length === 3 && i === 0 && "row-span-2")} />
                      ))}
                    </div>
                  ) : posters.length === 1 ? (
                    <div className="relative h-full w-full">
                      <Image src={`https://image.tmdb.org/t/p/w92${posters[0]}`} alt="" fill className="scale-110 object-cover blur-2xl brightness-50" />
                      <div className="relative flex h-full w-full items-center justify-center">
                        <Image src={`https://image.tmdb.org/t/p/w780${posters[0]}`} alt="" width={120} height={180} className="h-[85%] w-auto rounded-md object-cover shadow-xl" />
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
                  <CollectionEditPopover
                    list={l}
                    onDelete={(id, n) => setDeleteTarget({ id, name: n })}
                  />
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
          {customLists.length > visibleCount && !showAll ? (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setShowAll(true)}>
                See all collections ({customLists.length})
              </Button>
            </div>
          ) : customLists.length > 0 ? (
            <StateMessage preset="endOfItems" inline />
          ) : null}
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
  const [filters, setFilters] = useState<FilterOutput>({});
  const [collectionFilters, setCollectionFilters] = useState<CollectionFilterState>(DEFAULT_COLLECTION_FILTERS);

  useEffect(() => {
    document.title = "Library — Canto";
  }, []);

  const handleTabChange = (value: string): void => {
    const tab = value as Tab;
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== "watchlist") params.set("tab", tab);
    router.replace(`/lists${params.size > 0 ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  const handleFilterChange = useCallback((f: FilterOutput) => setFilters(f), []);
  const handleCollectionFilterChange = useCallback((f: CollectionFilterState) => setCollectionFilters(f), []);
  const handleCollectionFilterReset = useCallback(() => setCollectionFilters(DEFAULT_COLLECTION_FILTERS), []);

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Library"
        subtitle="Your watchlist, collections, and saved media."
      />

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Sidebar */}
        <div
          className={cn(
            "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
            showFilters
              ? "mr-4 opacity-100 lg:mr-8"
              : "-ml-[20rem] mr-0 opacity-0",
          )}
        >
          {activeTab === "collections" ? (
            <CollectionFilterSidebar
              filters={collectionFilters}
              onChange={handleCollectionFilterChange}
              onReset={handleCollectionFilterReset}
            />
          ) : (
            <FilterSidebar
              mediaType="all"
              onFilterChange={handleFilterChange}
            />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Tab Bar */}
          <TabBar
            tabs={TABS}
            value={activeTab}
            onChange={handleTabChange}
            leading={
              <FilterButton
                active={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              />
            }
          />
          {activeTab === "watchlist" && (
            <MediaListTab
              slug="watchlist"
              preset="emptyWatchlist"
              showFilters={showFilters}
              filters={filters}
            />
          )}
          {activeTab === "collections" && <CollectionsTab filters={collectionFilters} />}
          {activeTab === "server" && (
            <MediaListTab
              slug="server-library"
              preset="emptyServerLibrary"
              showFilters={showFilters}
              filters={filters}
            />
          )}
        </div>
      </div>
    </div>
  );
}

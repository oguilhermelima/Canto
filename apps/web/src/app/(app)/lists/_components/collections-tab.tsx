"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import { Bookmark, Loader2, Plus } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { CollectionEditPopover } from "./collection-edit-popover";
import type { CollectionFilterState } from "./collection-filter-sidebar";

export function CollectionsTab({
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

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
  ChevronRight,
  List,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";

export default function ListsPage(): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    document.title = "My Lists \u2014 Canto";
  }, []);

  const utils = trpc.useUtils();
  const { data: lists, isLoading: listsLoading } = trpc.list.getAll.useQuery();

  // Fetch watchlist and server library items for inline carousels
  const { data: watchlistData, isLoading: watchlistLoading } =
    trpc.list.getBySlug.useQuery({ slug: "watchlist", limit: 20 });
  const { data: serverData, isLoading: serverLoading } =
    trpc.list.getBySlug.useQuery({ slug: "server-library", limit: 20 });

  const createMutation = trpc.list.create.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("List created");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.list.delete.useMutation({
    onSuccess: () => {
      void utils.list.getAll.invalidate();
      setDeleteTarget(null);
      toast.success("List deleted");
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

  const customLists = lists?.filter((l) => l.type === "custom") ?? [];

  const mapItems = (
    items: NonNullable<typeof watchlistData>["items"],
  ) =>
    items.map((item) => ({
      id: item.media.id,
      type: item.media.type as "movie" | "show",
      title: item.media.title,
      posterPath: item.media.posterPath,
      year: item.media.year,
      voteAverage: item.media.voteAverage,
    }));

  return (
    <div className="w-full pt-6 pb-12">
      {/* Watchlist Carousel */}
      <MediaCarousel
        title="Watchlist"
        seeAllHref="/lists/watchlist"
        items={watchlistData ? mapItems(watchlistData.items) : []}
        isLoading={watchlistLoading}
      />

      {/* Server Library Carousel */}
      <MediaCarousel
        title="Server Library"
        seeAllHref="/lists/server-library"
        items={serverData ? mapItems(serverData.items) : []}
        isLoading={serverLoading}
        className="mt-8"
      />

      {/* My Lists Section */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-3 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <h2 className="text-xl font-semibold text-foreground">My Lists</h2>
          <button
            type="button"
            aria-label="Create list"
            onClick={() => setCreateOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-foreground/60 transition-colors hover:bg-foreground/15 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {listsLoading ? (
          <div className="flex gap-4 px-4 pb-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 w-[280px] shrink-0 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : customLists.length === 0 ? (
          <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-border/60">
              <div className="text-center">
                <List className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No custom lists yet
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create list
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto px-4 pb-4 scrollbar-none md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            {customLists.map((l) => (
              <Link
                key={l.id}
                href={`/lists/${l.slug}`}
                className="group relative flex w-[280px] shrink-0 flex-col rounded-xl bg-muted p-4 transition-colors hover:bg-muted/80"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
                    <List className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {l.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {l.itemCount} {l.itemCount === 1 ? "item" : "items"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground/50">
                    View list
                  </span>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteTarget({ id: l.id, name: l.name });
                  }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Create List Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create List</DialogTitle>
            <DialogDescription>
              Create a new list to organize your media.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekend Binges"
                className="h-10"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Description{" "}
                <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this list for?"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete List</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({ id: deleteTarget.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

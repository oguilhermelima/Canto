"use client";

import { useState, useEffect } from "react";
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
import {
  Bookmark,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { PageHeader } from "~/components/layout/page-header";

export default function ListsPage(): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showAllLists, setShowAllLists] = useState(false);

  const router = useRouter();

  useEffect(() => {
    document.title = "My Lists — Canto";
  }, []);

  const utils = trpc.useUtils();
  const { data: lists, isLoading: listsLoading } = trpc.list.getAll.useQuery();

  // Fetch watchlist and server library items for inline carousels
  const { data: watchlistData, isLoading: watchlistLoading } =
    trpc.list.getBySlug.useQuery({ slug: "watchlist", limit: 20 });
  const { data: serverData, isLoading: serverLoading } =
    trpc.list.getBySlug.useQuery({ slug: "server-library", limit: 20 });

  const createMutation = trpc.list.create.useMutation({
    onSuccess: (newList) => {
      void utils.list.getAll.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("List created");
      router.push(`/lists/${newList.slug}`);
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

  // Calculate how many cards fit in 2 rows based on current breakpoint
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const update = (): void => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(6);
      else if (w >= 1024) setCols(5);
      else if (w >= 640) setCols(4);
      else setCols(3);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const visibleCount = showAllLists ? Infinity : cols * 2;

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
    <div className="w-full pb-12">
      <PageHeader title="My Lists" />

      {/* Watchlist Carousel */}
      <MediaCarousel
        title="Watchlist"
        seeAllHref="/lists/watchlist"
        items={watchlistData ? mapItems(watchlistData.items) : []}
        isLoading={watchlistLoading}
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
          <div className="grid grid-cols-3 gap-2.5 px-4 sm:grid-cols-4 md:px-8 lg:grid-cols-5 lg:px-12 xl:grid-cols-6 xl:px-16 2xl:px-24">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : customLists.length === 0 ? (
          <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-border/60">
              <div className="text-center">
                <Bookmark className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
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
          <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {customLists.slice(0, visibleCount).map((l) => {
                const posters = l.previewPosters ?? [];

                return (
                  <Link
                    key={l.id}
                    href={`/lists/${l.slug}`}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-muted transition-transform duration-200 hover:scale-[1.03]"
                  >
                    {/* Thumbnail mosaic */}
                    {posters.length >= 4 ? (
                      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px">
                        {posters.slice(0, 4).map((p, i) => (
                          <Image
                            key={i}
                            src={`https://image.tmdb.org/t/p/w500${p}`}
                            alt=""
                            width={92}
                            height={138}
                            className="h-full w-full object-cover"
                          />
                        ))}
                      </div>
                    ) : posters.length > 0 ? (
                      <div className={cn(
                        "grid h-full w-full gap-px",
                        posters.length === 1 && "grid-cols-1",
                        posters.length === 2 && "grid-cols-2",
                        posters.length === 3 && "grid-cols-2 grid-rows-2",
                      )}>
                        {posters.map((p, i) => (
                          <Image
                            key={i}
                            src={`https://image.tmdb.org/t/p/w500${p}`}
                            alt=""
                            width={92}
                            height={138}
                            className={cn(
                              "h-full w-full object-cover",
                              posters.length === 3 && i === 0 && "row-span-2",
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Bookmark className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/10" />

                    {/* Gradient overlay + label */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-14">
                      <h3 className="truncate text-base font-semibold text-white">
                        {l.name}
                      </h3>
                      <p className="text-sm text-white/70">
                        {l.itemCount} {l.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      aria-label={`Delete ${l.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget({ id: l.id, name: l.name });
                      }}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white/70 opacity-0 backdrop-blur-sm transition-all hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Link>
                );
              })}
            </div>

            {customLists.length > visibleCount && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setShowAllLists(true)}
                >
                  See all ({customLists.length})
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Server Library Carousel */}
      <MediaCarousel
        title="Server Library"
        seeAllHref="/lists/server-library"
        items={serverData ? mapItems(serverData.items) : []}
        isLoading={serverLoading}
        className="mt-10"
      />

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

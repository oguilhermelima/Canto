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
  ChevronRight,
  Eye,
  Loader2,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { PageHeader } from "~/components/layout/page-header";

interface ListPreviewItem {
  id: string;
  type: string;
  title: string;
  posterPath: string | null;
}

function ListPreview({
  title,
  icon: Icon,
  href,
  items,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  href: string;
  items: ListPreviewItem[];
  isLoading: boolean;
}): React.JSX.Element {
  return (
    <section className="rounded-2xl bg-muted/50 p-4 sm:p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4.5 w-4.5 text-muted-foreground" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <span className="text-sm text-muted-foreground">
            {isLoading ? "..." : items.length}
          </span>
        </div>
        <Link
          href={href}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          See all
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Poster strip */}
      {isLoading ? (
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-[100px] shrink-0 animate-pulse rounded-lg bg-muted sm:w-[110px] lg:w-[120px]"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-xl">
          <p className="text-sm text-muted-foreground/60">No items yet</p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/media/${item.id}`}
              className="group/poster aspect-[2/3] w-[100px] shrink-0 overflow-hidden rounded-lg bg-muted transition-transform duration-200 hover:scale-105 sm:w-[110px] lg:w-[120px]"
            >
              {item.posterPath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                  alt={item.title}
                  width={120}
                  height={180}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Bookmark className="h-5 w-5 text-muted-foreground/20" />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

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
      if (w >= 1280) setCols(5);
      else if (w >= 1024) setCols(4);
      else if (w >= 640) setCols(3);
      else setCols(2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // +1 for the "New Collection" card
  const visibleCount = showAllLists ? Infinity : cols * 2 - 1;

  const customLists = lists?.filter((l) => l.type === "custom") ?? [];

  const mapPreviewItems = (items: NonNullable<typeof watchlistData>["items"]): ListPreviewItem[] =>
    items.map((item) => ({
      id: item.media.id,
      type: item.media.type,
      title: item.media.title,
      posterPath: item.media.posterPath,
    }));

  return (
    <div className="w-full pb-12">
      <PageHeader title="My Lists" />

      {/* Watchlist */}
      <div className="px-4 pt-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ListPreview
          title="Watchlist"
          icon={Eye}
          href="/lists/watchlist"
          items={watchlistData ? mapPreviewItems(watchlistData.items) : []}
          isLoading={watchlistLoading}
        />
      </div>

      {/* Collections */}
      <section className="mt-10">
        <div className="mb-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <h2 className="text-xl font-semibold text-foreground">Collections</h2>
        </div>

        {listsLoading ? (
          <div className="grid grid-cols-2 gap-2.5 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 lg:px-12 xl:grid-cols-5 xl:px-16 2xl:px-24">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {customLists.slice(0, visibleCount).map((l) => {
                const posters = l.previewPosters ?? [];

                return (
                  <Link
                    key={l.id}
                    href={`/lists/${l.slug}`}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted transition-transform duration-200 hover:scale-[1.03]"
                  >
                    {/* Thumbnail mosaic */}
                    {posters.length >= 4 ? (
                      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                        {posters.slice(0, 4).map((p, i) => (
                          <Image
                            key={i}
                            src={`https://image.tmdb.org/t/p/w500${p}`}
                            alt=""
                            width={250}
                            height={188}
                            className="h-full w-full object-cover"
                          />
                        ))}
                      </div>
                    ) : posters.length >= 2 ? (
                      <div className={cn(
                        "grid h-full w-full gap-0.5",
                        posters.length === 2 && "grid-cols-2",
                        posters.length === 3 && "grid-cols-2 grid-rows-2",
                      )}>
                        {posters.map((p, i) => (
                          <Image
                            key={i}
                            src={`https://image.tmdb.org/t/p/w500${p}`}
                            alt=""
                            width={250}
                            height={188}
                            className={cn(
                              "h-full w-full object-cover",
                              posters.length === 3 && i === 0 && "row-span-2",
                            )}
                          />
                        ))}
                      </div>
                    ) : posters.length === 1 ? (
                      <div className="relative h-full w-full">
                        {/* Blurred backdrop */}
                        <Image
                          src={`https://image.tmdb.org/t/p/w92${posters[0]}`}
                          alt=""
                          fill
                          className="object-cover blur-2xl scale-110 brightness-50"
                        />
                        {/* Centered poster */}
                        <div className="relative flex h-full w-full items-center justify-center">
                          <Image
                            src={`https://image.tmdb.org/t/p/w500${posters[0]}`}
                            alt=""
                            width={120}
                            height={180}
                            className="h-[85%] w-auto rounded-md object-cover shadow-xl"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
                        <Bookmark className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/10" />

                    {/* Gradient overlay + label */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-10">
                      <h3 className="truncate text-base font-semibold text-white">
                        {l.name}
                      </h3>
                      <p className="text-sm text-white/60">
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

              {/* New Collection card */}
              {(showAllLists || customLists.length < visibleCount + 1) && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 bg-muted/30 transition-all duration-200 hover:scale-[1.03] hover:border-foreground/20 hover:bg-muted/50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 transition-colors group-hover:bg-foreground/10">
                    <Plus className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                    New Collection
                  </span>
                </button>
              )}
            </div>

            {customLists.length > visibleCount && !showAllLists && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAllLists(true)}
                >
                  See all collections ({customLists.length})
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Shared */}
      <section className="mt-10">
        <div className="mb-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <h2 className="text-xl font-semibold text-foreground">Shared</h2>
        </div>
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <ListPreview
            title="Server Library"
            icon={Server}
            href="/lists/server-library"
            items={serverData ? mapPreviewItems(serverData.items) : []}
            isLoading={serverLoading}
          />
        </div>
      </section>

      {/* Create List Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>
              Create a collection to organize your movies and shows.
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
                placeholder="What's this collection for?"
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
            <DialogTitle>Delete Collection</DialogTitle>
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

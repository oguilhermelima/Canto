"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import { Input } from "@canto/ui/input";
import { ArrowUpDown, Check, EllipsisVertical, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { trpc } from "~/lib/trpc/client";
import { DEFAULT_COLLECTION_FILTERS } from "../_components/collection-filter-sidebar";
import { CollectionsTab } from "../_components/collections-tab";
import { CollectionsSectionsView } from "../_components/collections-sections-view";

export default function CollectionsPage(): React.JSX.Element {
  useDocumentTitle("Collections");
  const [isReordering, setIsReordering] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const router = useRouter();
  const utils = trpc.useUtils();

  const createMutation = trpc.list.create.useMutation({
    onSuccess: (newList) => {
      void utils.list.getAll.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("Collection created");
      router.push(`/collection/${newList.slug}`);
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

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Collections"
        subtitle="Organize your movies and shows into lists."
        action={
          isReordering ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-sm font-medium"
              onClick={() => setIsReordering(false)}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Done
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Collection options"
                >
                  <EllipsisVertical className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl">
                <DropdownMenuItem
                  className="cursor-pointer gap-2 rounded-xl px-3 py-2"
                  onClick={() => setIsReordering(true)}
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Reorder
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2 rounded-xl px-3 py-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  New Collection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      {isReordering ? (
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <CollectionsTab filters={DEFAULT_COLLECTION_FILTERS} />
        </div>
      ) : (
        <CollectionsSectionsView
          onCreateCollection={() => setCreateOpen(true)}
        />
      )}

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
                <span className="text-muted-foreground">(optional)</span>
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
    </div>
  );
}

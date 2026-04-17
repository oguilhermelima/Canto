"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

export function NewCollectionCard(): React.JSX.Element {
  return (
    <Link
      href="/library/collections"
      className="group relative flex w-[260px] shrink-0 overflow-hidden rounded-xl border border-dashed border-border/50 transition-colors duration-200 hover:border-foreground/20 hover:bg-muted/30 sm:w-[280px] lg:w-[300px]"
    >
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <Plus className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          New Collection
        </p>
      </div>
    </Link>
  );
}

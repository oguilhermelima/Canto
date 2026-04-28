"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

export function NewCollectionCard(): React.JSX.Element {
  return (
    <Link
      href="/library/collections"
      className="group relative mt-1 flex w-[300px] shrink-0 overflow-hidden rounded-2xl border border-dashed border-border transition-colors duration-200 hover:border-foreground hover:bg-muted/30 sm:w-[340px] lg:w-[380px] 2xl:w-[420px]"
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

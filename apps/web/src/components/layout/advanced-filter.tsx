"use client";

import { useRef } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { RotateCcw, X } from "lucide-react";
import { FilterSidebar } from "~/components/media/filter-sidebar";
import type { FilterOutput, FilterSidebarHandle } from "~/components/media/filter-sidebar";
import type { FilterPreset } from "~/components/layout/browse-layout.types";

interface AdvancedFilterProps {
  preset: FilterPreset;
  mediaType: "movie" | "show" | "all";
  sidebarOpen: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onFilterChange: (filters: FilterOutput) => void;
  sidebarClassName?: string;
}

export function AdvancedFilter({
  preset,
  mediaType,
  sidebarOpen,
  mobileOpen,
  onMobileOpenChange,
  onFilterChange,
  sidebarClassName,
}: AdvancedFilterProps): React.JSX.Element {
  const mobileResetRef = useRef<FilterSidebarHandle | null>(null);

  return (
    <>
      {/* Desktop: sidebar with slide animation */}
      <div
        className={cn(
          "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
          sidebarOpen
            ? "mr-4 opacity-100 lg:mr-8"
            : "-ml-[20rem] mr-0 opacity-0",
        )}
      >
        <FilterSidebar
          preset={preset}
          mediaType={mediaType}
          onFilterChange={onFilterChange}
          className={sidebarClassName}
        />
      </div>

      {/* Mobile: full-screen dialog from bottom */}
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent
          className="fixed inset-0 flex h-full w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 [&>button:last-child]:hidden"
        >
          <DialogHeader bar>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold">Filters</DialogTitle>
              <button
                type="button"
                onClick={() => onMobileOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <FilterSidebar
              preset={preset}
              mediaType={mediaType}
              onFilterChange={onFilterChange}
              hideHeader
              resetRef={mobileResetRef}
            />
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border/40 px-6 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => mobileResetRef.current?.reset()}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
              <Button
                className="flex-1"
                onClick={() => onMobileOpenChange(false)}
              >
                View Results
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

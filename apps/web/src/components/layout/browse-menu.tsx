"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@canto/ui/sheet";
import { EllipsisVertical, LayoutGrid, List } from "lucide-react";
import type { ViewMode, BrowseMenuItem } from "~/components/layout/browse-layout.types";

interface BrowseMenuProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  items?: BrowseMenuItem[];
}

const triggerClass = "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground";

export function BrowseMenu({
  viewMode,
  onViewModeChange,
  items,
}: BrowseMenuProps): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop: DropdownMenu */}
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={triggerClass}>
              <EllipsisVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            <DropdownMenuItem
              onClick={() => onViewModeChange("grid")}
              className={cn(viewMode === "grid" && "text-foreground font-medium")}
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Grid view
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewModeChange("list")}
              className={cn(viewMode === "list" && "text-foreground font-medium")}
            >
              <List className="mr-2 h-4 w-4" />
              List view
            </DropdownMenuItem>
            {items && items.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {items.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    className={item.className}
                  >
                    {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: Sheet from bottom */}
      <div className="md:hidden">
        <button type="button" className={triggerClass} onClick={() => setSheetOpen(true)}>
          <EllipsisVertical className="h-5 w-5" />
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="sr-only">
              <SheetTitle>Options</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 py-2">
              <button
                type="button"
                onClick={() => { onViewModeChange("grid"); setSheetOpen(false); }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                  viewMode === "grid" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Grid view
              </button>
              <button
                type="button"
                onClick={() => { onViewModeChange("list"); setSheetOpen(false); }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                  viewMode === "list" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <List className="h-4 w-4" />
                List view
              </button>
              {items && items.length > 0 && (
                <>
                  <div className="mx-4 border-t border-border/40" />
                  {items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => { item.onClick(); setSheetOpen(false); }}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors",
                        item.className,
                      )}
                    >
                      {item.icon && <item.icon className="h-4 w-4" />}
                      {item.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

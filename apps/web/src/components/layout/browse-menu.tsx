"use client";

import { cn } from "@canto/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import { EllipsisVertical, LayoutGrid, List } from "lucide-react";
import type { ViewMode } from "~/components/layout/browse-layout.types";

interface BrowseMenuProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  children?: React.ReactNode;
}

export function BrowseMenu({
  viewMode,
  onViewModeChange,
  children,
}: BrowseMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-muted/60 text-muted-foreground transition-colors hover:text-foreground"
        >
          <EllipsisVertical className="h-4 w-4" />
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
        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

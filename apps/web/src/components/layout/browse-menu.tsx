"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import { Separator } from "@canto/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import type { ViewMode, BrowseMenuGroup } from "~/components/layout/browse-layout.types";

interface BrowseMenuProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  groups?: BrowseMenuGroup[];
}

const triggerClass = "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground";

export function BrowseMenu({
  viewMode,
  onViewModeChange,
  groups,
}: BrowseMenuProps): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  const viewItems = [
    { label: "Grid", icon: LayoutGrid, value: "grid" as const },
    { label: "List", icon: List, value: "list" as const },
  ];

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
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuLabel className="text-xs text-muted-foreground">View</DropdownMenuLabel>
            {viewItems.map((item) => (
              <DropdownMenuItem
                key={item.value}
                onClick={() => onViewModeChange(item.value)}
                className={cn(viewMode === item.value && "text-foreground font-medium")}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label} view
              </DropdownMenuItem>
            ))}
            {groups?.map((group) => (
              <div key={group.label}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    className={item.className}
                  >
                    {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: Sheet from bottom — round icon grid like user menu */}
      <div className="md:hidden">
        <button type="button" className={triggerClass} onClick={() => setSheetOpen(true)}>
          <EllipsisVertical className="h-5 w-5" />
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom">
            <SheetHeader className="sr-only">
              <SheetTitle>Options</SheetTitle>
            </SheetHeader>

            {/* View section */}
            <div className="grid grid-cols-3">
              {viewItems.map((item) => {
                const active = viewMode === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => { onViewModeChange(item.value); setSheetOpen(false); }}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <div className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full transition-colors active:bg-muted",
                      active ? "bg-foreground" : "bg-muted/60",
                    )}>
                      <item.icon className={cn("h-[22px] w-[22px]", active ? "text-background" : "text-foreground/80")} />
                    </div>
                    <span className="text-center text-xs leading-tight text-foreground/80">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Extra groups */}
            {groups?.map((group) => (
              <div key={group.label} className="mt-5 border-t border-border/50 pt-5">
                <div className="grid grid-cols-3">
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => { item.onClick(); setSheetOpen(false); }}
                      className="flex flex-col items-center gap-2.5"
                    >
                      <div className={cn(
                        "flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 transition-colors active:bg-muted",
                        item.className?.includes("text-red") && "bg-red-500/10",
                      )}>
                        {item.icon && (
                          <item.icon className={cn(
                            "h-[22px] w-[22px]",
                            item.className?.includes("text-red") ? "text-red-400" : "text-foreground/80",
                          )} />
                        )}
                      </div>
                      <span className={cn(
                        "text-center text-xs leading-tight",
                        item.className?.includes("text-red") ? "text-red-400" : "text-foreground/80",
                      )}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

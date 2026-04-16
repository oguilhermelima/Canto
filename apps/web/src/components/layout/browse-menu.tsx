"use client";

import { cn } from "@canto/ui/cn";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@canto/ui/dropdown-menu";
import { EllipsisVertical, LayoutGrid, List } from "lucide-react";
import type { ViewMode, BrowseMenuGroup } from "~/components/layout/browse-layout.types";
import { ResponsiveMenu } from "./responsive-menu";

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
  const viewItems = [
    { label: "Grid", icon: LayoutGrid, value: "grid" as const },
    { label: "List", icon: List, value: "list" as const },
  ];

  return (
    <ResponsiveMenu
      trigger={(
        <button type="button" className={triggerClass}>
          <EllipsisVertical className="h-5 w-5" />
        </button>
      )}
      desktopContentClassName="min-w-[11rem]"
      sheetTitle="Options"
      desktopContent={(
        <>
          {groups?.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
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
          {groups && groups.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            View
          </DropdownMenuLabel>
          {viewItems.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onClick={() => onViewModeChange(item.value)}
              className={cn(viewMode === item.value && "font-medium text-foreground")}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label} view
            </DropdownMenuItem>
          ))}
        </>
      )}
      mobileContent={({ close }) => (
        <>
          {groups?.map((group, gi) => (
            <div
              key={group.label}
              className={gi > 0 ? "mt-5 border-t border-border/50 pt-5" : ""}
            >
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-3">
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      item.onClick();
                      close();
                    }}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <div
                      className={cn(
                        "flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 transition-colors active:bg-muted",
                        item.className?.includes("text-red") && "bg-red-500/10",
                      )}
                    >
                      {item.icon && (
                        <item.icon
                          className={cn(
                            "h-[22px] w-[22px]",
                            item.className?.includes("text-red")
                              ? "text-red-400"
                              : "text-foreground/80",
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-center text-xs leading-tight",
                        item.className?.includes("text-red")
                          ? "text-red-400"
                          : "text-foreground/80",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div
            className={cn(
              groups && groups.length > 0 ? "mt-5 border-t border-border/50 pt-5" : "",
            )}
          >
            <p className="mb-3 text-xs font-medium text-muted-foreground">View</p>
            <div className="grid grid-cols-3">
              {viewItems.map((item) => {
                const active = viewMode === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      onViewModeChange(item.value);
                      close();
                    }}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <div
                      className={cn(
                        "flex h-16 w-16 items-center justify-center rounded-full transition-colors active:bg-muted",
                        active ? "bg-foreground" : "bg-muted/60",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-[22px] w-[22px]",
                          active ? "text-background" : "text-foreground/80",
                        )}
                      />
                    </div>
                    <span className="text-center text-xs leading-tight text-foreground/80">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    />
  );
}

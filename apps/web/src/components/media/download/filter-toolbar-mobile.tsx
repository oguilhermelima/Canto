"use client";

import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  SORT_COLUMNS,
  SORT_LABELS
  
  
} from "./filter-toolbar-shared";
import type {SortColumn, SortDir} from "./filter-toolbar-shared";

interface FilterToolbarMobileProps {
  searchValue: string;
  onSearch: (value: string) => void;
  quality: string;
  onQuality: (value: string) => void;
  source: string;
  onSource: (value: string) => void;
  size: string;
  onSize: (value: string) => void;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onToggleSort: (col: SortColumn) => void;
  open: boolean;
  onToggleOpen: () => void;
}

export function FilterToolbarMobile({
  searchValue,
  onSearch,
  quality,
  onQuality,
  source,
  onSource,
  size,
  onSize,
  sortColumn,
  sortDir,
  onToggleSort,
  open,
  onToggleOpen,
}: FilterToolbarMobileProps): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl bg-muted/40 md:hidden">
      <div className="flex items-center">
        <button
          onClick={onToggleOpen}
          className="flex flex-1 items-center gap-2 px-4 py-3 text-xs font-medium text-muted-foreground"
        >
          <SlidersHorizontal size={14} />
          Filters & Sort
          <ChevronDown
            size={12}
            className={cn(
              "ml-auto transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Filter results..."
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                className="h-10 w-full rounded-xl border-0 bg-background pl-9 text-sm focus-visible:ring-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={quality} onValueChange={onQuality}>
                <SelectTrigger className="h-9 rounded-xl border-0 bg-background px-3 text-xs text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Quality</SelectItem>
                  <SelectItem value="uhd">4K</SelectItem>
                  <SelectItem value="fullhd">1080p</SelectItem>
                  <SelectItem value="hd">720p</SelectItem>
                  <SelectItem value="sd">SD</SelectItem>
                </SelectContent>
              </Select>
              <Select value={source} onValueChange={onSource}>
                <SelectTrigger className="h-9 rounded-xl border-0 bg-background px-3 text-xs text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Source</SelectItem>
                  <SelectItem value="remux">Remux</SelectItem>
                  <SelectItem value="bluray">Blu-Ray</SelectItem>
                  <SelectItem value="webdl">WEB-DL</SelectItem>
                  <SelectItem value="webrip">WEBRip</SelectItem>
                  <SelectItem value="hdtv">HDTV</SelectItem>
                </SelectContent>
              </Select>
              <Select value={size} onValueChange={onSize}>
                <SelectTrigger className="h-9 rounded-xl border-0 bg-background px-3 text-xs text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Size</SelectItem>
                  <SelectItem value="small">{"< 2 GB"}</SelectItem>
                  <SelectItem value="medium">2–10 GB</SelectItem>
                  <SelectItem value="large">{"> 10 GB"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="mr-0.5 text-xs text-muted-foreground">
                Sort
              </span>
              {SORT_COLUMNS.map((col) => (
                <button
                  key={col}
                  onClick={() => onToggleSort(col)}
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-xl text-xs transition-colors",
                    sortColumn === col
                      ? "bg-background font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {SORT_LABELS[col]}
                  {sortColumn === col &&
                    (sortDir === "desc" ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronUp size={10} />
                    ))}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

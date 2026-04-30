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
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import {
  SORT_COLUMNS,
  SORT_LABELS
  
  
} from "./filter-toolbar-shared";
import type {SortColumn, SortDir} from "./filter-toolbar-shared";

interface FilterToolbarDesktopProps {
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
}

export function FilterToolbarDesktop({
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
}: FilterToolbarDesktopProps): React.JSX.Element {
  return (
    <div className="hidden md:block">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Filter results..."
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
          className="h-10 rounded-xl border-0 bg-muted/40 pl-10 text-sm focus-visible:ring-1"
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Select value={quality} onValueChange={onQuality}>
          <SelectTrigger className="h-8 w-auto rounded-lg border-0 bg-muted/60 px-2.5 text-xs text-foreground">
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
          <SelectTrigger className="h-8 w-auto rounded-lg border-0 bg-muted/60 px-2.5 text-xs text-foreground">
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
          <SelectTrigger className="h-8 w-auto rounded-lg border-0 bg-muted/60 px-2.5 text-xs text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Size</SelectItem>
            <SelectItem value="small">{"< 2 GB"}</SelectItem>
            <SelectItem value="medium">2–10 GB</SelectItem>
            <SelectItem value="large">{"> 10 GB"}</SelectItem>
          </SelectContent>
        </Select>
        <div className="mx-1 h-4 w-px bg-border/50" />
        <span className="text-xs text-muted-foreground">Sort</span>
        <div className="flex items-center gap-0.5">
          {SORT_COLUMNS.map((col) => (
            <button
              key={col}
              onClick={() => onToggleSort(col)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs transition-colors",
                sortColumn === col
                  ? "bg-muted/60 font-medium text-foreground"
                  : "text-muted-foreground hover:text-muted-foreground",
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
  );
}

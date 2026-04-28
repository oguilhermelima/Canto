"use client";

import { FilterToolbarDesktop } from "./filter-toolbar-desktop";
import { FilterToolbarMobile } from "./filter-toolbar-mobile";
import type { SortColumn, SortDir } from "./filter-toolbar-shared";

interface FilterToolbarProps {
  search: {
    value: string;
    onChange: (value: string) => void;
  };
  filters: {
    quality: string;
    setQuality: (value: string) => void;
    source: string;
    setSource: (value: string) => void;
    size: string;
    setSize: (value: string) => void;
  };
  sort: {
    column: SortColumn;
    dir: SortDir;
    toggle: (col: SortColumn) => void;
  };
  mobileOpen: boolean;
  onToggleMobile: () => void;
}

export function FilterToolbar({
  search,
  filters,
  sort,
  mobileOpen,
  onToggleMobile,
}: FilterToolbarProps): React.JSX.Element {
  const handleSearch = (value: string): void => {
    search.onChange(value);
  };
  const handleQuality = (value: string): void => {
    filters.setQuality(value);
  };
  const handleSource = (value: string): void => {
    filters.setSource(value);
  };
  const handleSize = (value: string): void => {
    filters.setSize(value);
  };

  return (
    <div className="shrink-0 border-b border-border px-5 py-3">
      <FilterToolbarMobile
        searchValue={search.value}
        onSearch={handleSearch}
        quality={filters.quality}
        onQuality={handleQuality}
        source={filters.source}
        onSource={handleSource}
        size={filters.size}
        onSize={handleSize}
        sortColumn={sort.column}
        sortDir={sort.dir}
        onToggleSort={sort.toggle}
        open={mobileOpen}
        onToggleOpen={onToggleMobile}
      />
      <FilterToolbarDesktop
        searchValue={search.value}
        onSearch={handleSearch}
        quality={filters.quality}
        onQuality={handleQuality}
        source={filters.source}
        onSource={handleSource}
        size={filters.size}
        onSize={handleSize}
        sortColumn={sort.column}
        sortDir={sort.dir}
        onToggleSort={sort.toggle}
      />
    </div>
  );
}

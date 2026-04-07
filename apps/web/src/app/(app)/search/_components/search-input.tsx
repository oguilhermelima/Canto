"use client";

import { Search } from "lucide-react";
import { Input } from "@canto/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function MobileSearchInput({
  value,
  onChange,
}: SearchInputProps): React.JSX.Element {
  return (
    <div className="sticky top-0 z-30 bg-background px-4 pb-1 pt-2.5 md:hidden">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search movies and shows..."
          className="h-9 rounded-none border-x-0 border-t-0 border-b-border bg-transparent pl-9 text-sm focus-visible:border-b-ring focus-visible:ring-0 focus-visible:ring-offset-0"
          autoFocus
        />
      </div>
    </div>
  );
}

export function DesktopSearchInput({
  value,
  onChange,
}: SearchInputProps): React.JSX.Element {
  return (
    <div className="hidden pb-1 pt-4 md:block">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search movies and shows..."
          className="h-12 rounded-none border-x-0 border-t-0 border-b-border bg-transparent pl-10 text-lg focus-visible:border-b-ring focus-visible:ring-0 focus-visible:ring-offset-0"
          autoFocus
        />
      </div>
    </div>
  );
}

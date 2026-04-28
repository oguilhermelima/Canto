"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  CornerLeftUp,
  Folder,
  FolderSearch,
  Loader2,
} from "lucide-react";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { trpc } from "@/lib/trpc/client";

interface PathInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Show the folder browser button. Disable for remote paths (qBittorrent namespace). */
  showBrowser?: boolean;
}

export function PathInput({
  value,
  onChange,
  placeholder,
  className,
  showBrowser = true,
}: PathInputProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState(value || "/");
  const { data, isLoading } = trpc.folder.browse.useQuery(
    { path: browsePath },
    { enabled: open },
  );

  const handleOpen = (nextOpen: boolean): void => {
    if (nextOpen) setBrowsePath(value || "/");
    setOpen(nextOpen);
  };

  const handleSelect = (path: string): void => {
    onChange(path);
    setOpen(false);
  };

  if (!showBrowser) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(className, "flex-1")}
      />
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Browse folders"
          >
            <FolderSearch className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-sm font-medium text-foreground truncate">
              {data?.path ?? browsePath}
            </p>
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1.5">
            {/* Go up */}
            {data?.parent && data.parent !== data.path && (
              <button
                type="button"
                onClick={() => setBrowsePath(data.parent)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <CornerLeftUp className="h-4 w-4 shrink-0" />
                ..
              </button>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : data?.dirs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No subfolders
              </p>
            ) : (
              data?.dirs.map((dir) => (
                <div key={dir.path} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleSelect(dir.path)}
                    className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent transition-colors min-w-0"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{dir.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrowsePath(dir.path)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Open folder"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          {/* Select current folder */}
          <div className="border-t border-border p-2">
            <Button
              size="sm"
              className="w-full rounded-xl gap-2"
              onClick={() => handleSelect(data?.path ?? browsePath)}
            >
              <Check className="h-3.5 w-3.5" />
              Select this folder
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

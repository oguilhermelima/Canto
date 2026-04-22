"use client";

import { Download, Link2, Upload } from "lucide-react";
import { Button } from "@canto/ui/button";
import { DropdownMenuItem } from "@canto/ui/dropdown-menu";
import { ResponsiveMenu } from "@/components/layout/responsive-menu";

interface ImportMenuProps {
  onSelectTorrent: () => void;
  onMagnet: () => void;
  onClient: () => void;
}

export function ImportMenu({
  onSelectTorrent,
  onMagnet,
  onClient,
}: ImportMenuProps): React.JSX.Element {
  return (
    <ResponsiveMenu
      trigger={(
        <Button variant="outline" size="sm" className="gap-2.5 rounded-xl px-4">
          <Upload className="h-4 w-4" />
          Import
        </Button>
      )}
      desktopContentClassName="w-64"
      sheetTitle="Import downloads"
      desktopContent={(
        <>
          <DropdownMenuItem
            className="gap-3 px-3 py-2.5 text-sm font-medium"
            onClick={onSelectTorrent}
          >
            <Upload className="h-4 w-4" />
            Import .torrent
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 px-3 py-2.5 text-sm font-medium"
            onClick={onMagnet}
          >
            <Link2 className="h-4 w-4" />
            Import magnetic link
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 px-3 py-2.5 text-sm font-medium"
            onClick={onClient}
          >
            <Download className="h-4 w-4" />
            Import from qBittorrent
          </DropdownMenuItem>
        </>
      )}
      mobileContent={({ close }) => (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { onSelectTorrent(); close(); }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80"
          >
            <Upload className="h-4 w-4 shrink-0" />
            Import .torrent
          </button>
          <button
            type="button"
            onClick={() => { onMagnet(); close(); }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            Import magnetic link
          </button>
          <button
            type="button"
            onClick={() => { onClient(); close(); }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80"
          >
            <Download className="h-4 w-4 shrink-0" />
            Import from qBittorrent
          </button>
        </div>
      )}
    />
  );
}

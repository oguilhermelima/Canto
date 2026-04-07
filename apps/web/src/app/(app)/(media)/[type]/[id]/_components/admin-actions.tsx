"use client";

import Link from "next/link";
import { Download, Settings2 } from "lucide-react";

interface AdminActionsProps {
  media: {
    id: string;
    type: string;
    externalId: number | null;
    inLibrary: boolean;
  };
  isAdmin: boolean;
  mediaType: "movie" | "show";
  openTorrentDialog: (context?: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  }) => void;
  setSeasonsHighlight: (v: boolean) => void;
}

export function AdminActions({
  media,
  isAdmin,
  mediaType,
  openTorrentDialog,
  setSeasonsHighlight,
}: AdminActionsProps): React.JSX.Element | null {
  if (!isAdmin || !media.id) return null;

  return (
    <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <div className="flex-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {media.inLibrary ? "Download & Manage" : "Download"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {media.inLibrary
            ? "Download another version or manage library settings."
            : "Search for torrents to download this content."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (media.type === "show") {
              const el = document.getElementById("seasons-section");
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                setSeasonsHighlight(true);
                setTimeout(() => setSeasonsHighlight(false), 2000);
              }
            } else {
              openTorrentDialog();
            }
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Download className="h-4 w-4" />
          {media.inLibrary ? "Download Variant" : "Download"}
        </button>
        {media.inLibrary && (
          <Link
            href={`/${mediaType === "show" ? "shows" : "movies"}/${media.externalId}/manage`}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground/15 px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/25"
          >
            <Settings2 className="h-4 w-4" />
            Manage
          </Link>
        )}
      </div>
    </section>
  );
}

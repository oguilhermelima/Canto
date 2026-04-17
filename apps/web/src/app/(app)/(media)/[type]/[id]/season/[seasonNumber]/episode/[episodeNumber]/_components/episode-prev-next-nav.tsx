"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface EpisodeNavLink {
  number: number;
  title: string | null;
}

interface EpisodePrevNextNavProps {
  showExternalId: string;
  seasonNum: number;
  prev?: EpisodeNavLink;
  next?: EpisodeNavLink;
}

export function EpisodePrevNextNav({
  showExternalId,
  seasonNum,
  prev,
  next,
}: EpisodePrevNextNavProps): React.JSX.Element {
  return (
    <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
      {prev ? (
        <Link
          href={`/shows/${showExternalId}/season/${seasonNum}/episode/${prev.number}`}
          className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft size={16} className="text-muted-foreground transition-colors group-hover:text-foreground" />
          <div>
            <span className="text-xs text-muted-foreground">Previous</span>
            <p className="mt-0.5 font-medium text-foreground">
              E{String(prev.number).padStart(2, "0")} — {prev.title || `Episode ${prev.number}`}
            </p>
          </div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/shows/${showExternalId}/season/${seasonNum}/episode/${next.number}`}
          className="group flex items-center gap-2 text-right text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <div>
            <span className="text-xs text-muted-foreground">Next</span>
            <p className="mt-0.5 font-medium text-foreground">
              E{String(next.number).padStart(2, "0")} — {next.title || `Episode ${next.number}`}
            </p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground transition-colors group-hover:text-foreground" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}

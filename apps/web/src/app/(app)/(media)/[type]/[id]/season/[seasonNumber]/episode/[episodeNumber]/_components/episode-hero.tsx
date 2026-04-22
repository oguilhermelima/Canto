"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FadeImage } from "@/components/ui/fade-image";
import { tmdbBackdropLoader } from "@/lib/tmdb-image";
import { EpisodeInfo } from "./episode-info";

interface EpisodeHeroProps {
  stillSrc: string | null;
  showHref: string;
  showTitle: string;
  episode: React.ComponentProps<typeof EpisodeInfo>["episode"];
  sNum: string;
  eNum: string;
  seasonNum: number;
}

export function EpisodeHero({
  stillSrc,
  showHref,
  showTitle,
  episode,
  sNum,
  eNum,
  seasonNum,
}: EpisodeHeroProps): React.JSX.Element {
  return (
    <div className="relative -mt-16 w-full overflow-hidden max-md:mt-0">
      {stillSrc ? (
        <>
          <div className="absolute inset-x-0 top-0 h-[80vh] overflow-hidden max-md:hidden">
            <FadeImage
              loader={tmdbBackdropLoader}
              src={stillSrc}
              alt=""
              fill
              className="object-cover object-top"
              fadeDuration={700}
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background from-0% via-background/40 via-40% to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />
          </div>
          <div className="absolute inset-x-0 top-[65vh] h-[20vh] bg-gradient-to-b from-transparent to-background max-md:hidden" />
        </>
      ) : (
        <div className="absolute inset-x-0 top-0 h-[80vh] bg-gradient-to-b from-muted/30 to-background max-md:hidden" />
      )}

      {stillSrc && (
        <div className="relative aspect-video w-full overflow-hidden bg-muted md:hidden">
          <FadeImage
            loader={tmdbBackdropLoader}
            src={stillSrc}
            alt=""
            fill
            className="object-cover"
            fadeDuration={500}
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>
      )}

      <div className="relative mx-auto hidden min-h-[55vh] w-full flex-col justify-end px-4 pb-10 pt-24 md:flex md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <Link
          href={showHref}
          className="mb-6 inline-flex w-fit items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft size={18} />
          {showTitle}
        </Link>

        <EpisodeInfo episode={episode} sNum={sNum} eNum={eNum} seasonNum={seasonNum} variant="hero" />
      </div>
    </div>
  );
}

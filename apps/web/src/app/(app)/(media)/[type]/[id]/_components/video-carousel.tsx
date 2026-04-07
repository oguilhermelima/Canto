"use client";

import { useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";

interface Video {
  id?: string;
  key: string;
  name?: string;
  type?: string;
}

export function VideoCarousel({
  videos,
}: {
  videos: Video[];
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  const scroll = useCallback(
    (dir: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollBy({
        left: dir === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8,
        behavior: "smooth",
      });
      setTimeout(updateScroll, 350);
    },
    [updateScroll],
  );

  return (
    <section className="relative">
      <h2 className="mb-4 pl-4 text-xl font-semibold text-foreground md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        Videos
      </h2>
      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("left")}
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("right")}
          >
            <ChevronRight size={28} />
          </button>
        )}
        <div
          ref={scrollRef}
          onScroll={updateScroll}
          className="flex gap-4 overflow-x-auto pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {videos.map((video) => (
            <a
              key={video.id ?? video.key}
              href={`https://www.youtube.com/watch?v=${video.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-video w-[300px] shrink-0 overflow-hidden rounded-xl bg-muted sm:w-[340px] lg:w-[380px]"
            >
              <img
                src={`https://img.youtube.com/vi/${video.key}/hqdefault.jpg`}
                alt={video.name ?? "Video"}
                width={480}
                height={360}
                className="h-full w-full object-cover opacity-0 transition-[opacity,transform] duration-500 group-hover:scale-105"
                onLoad={(e) => { e.currentTarget.classList.remove("opacity-0"); e.currentTarget.classList.add("opacity-100"); }}
                onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`; }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
                <Play className="h-10 w-10 text-white" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-3">
                <p className="line-clamp-1 text-sm font-medium text-white">
                  {video.name}
                </p>
                {video.type && (
                  <span className="mt-1 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
                    {video.type}
                  </span>
                )}
              </div>
            </a>
          ))}
          {/* End spacer */}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}

export function VideoCarouselSkeleton(): React.JSX.Element {
  return (
    <section className="relative">
      <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="flex gap-4 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-video w-[300px] shrink-0 rounded-xl sm:w-[340px] lg:w-[380px]"
          />
        ))}
      </div>
    </section>
  );
}

export function VideoCarouselSection({
  videos,
  isLoading,
}: {
  videos: Video[];
  isLoading: boolean;
}): React.JSX.Element | null {
  if (isLoading) return <VideoCarouselSkeleton />;
  if (videos.length === 0) return null;

  return (
    <div className="animate-in fade-in-0 duration-500">
      <VideoCarousel videos={videos.slice(0, 8)} />
    </div>
  );
}

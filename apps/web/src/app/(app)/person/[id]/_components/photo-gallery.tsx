"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PhotoGallery({
  images,
  name,
}: {
  images: { filePath: string; aspectRatio: number }[];
  name: string;
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
        Photos
      </h2>
      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("left")}
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {canScrollRight && (
          <button
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
          {images.map((img) => (
            <div
              key={img.filePath}
              className="relative h-[280px] w-[190px] shrink-0 overflow-hidden rounded-xl bg-muted md:h-[340px] md:w-[230px]"
            >
              <Image
                src={`https://image.tmdb.org/t/p/w780${img.filePath}`}
                alt={name}
                fill
                className="object-cover"
                loading="lazy"
                sizes="230px"
              />
            </div>
          ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";

function posterSrc(path: string, width: 185 | 342): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w${width}${path}`;
}

export function CollectionCard({
  list,
}: {
  list: {
    id: string;
    slug: string;
    name: string;
    type: string;
    itemCount: number;
    previewPosters: string[] | null;
  };
}): React.JSX.Element {
  const posters = (list.previewPosters ?? []).slice(0, 4);
  const count = posters.length;
  const firstPoster = posters[0];

  return (
    <Link
      href={`/collection/${list.slug}`}
      className="group relative mt-1 flex w-[300px] shrink-0 overflow-hidden rounded-2xl ring-1 ring-border/40 transition-[box-shadow,transform] duration-300 hover:ring-2 hover:ring-foreground/30 sm:w-[340px] lg:w-[380px] 2xl:w-[420px]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {firstPoster ? (
          <>
            <Image
              src={posterSrc(firstPoster, 342)}
              alt=""
              fill
              className="scale-125 object-cover blur-2xl"
              sizes="420px"
            />
            <div className="absolute inset-0 bg-black/40" />

            <div className="absolute inset-0 flex items-center justify-center pb-1">
              {posters.map((poster, i) => {
                const mid = (count - 1) / 2;
                const offset = i - mid;
                const rotate = offset * 5;
                const translateX = offset * 46;
                const z = count - Math.round(Math.abs(offset));
                return (
                  <div
                    key={poster}
                    className="absolute aspect-[2/3] h-[96%] overflow-hidden rounded-xl shadow-[0_14px_34px_-10px_rgba(0,0,0,0.7)] ring-1 ring-black/20 transition-transform duration-500 group-hover:scale-[1.03]"
                    style={{
                      transform: `translateX(${translateX}px) rotate(${rotate}deg)`,
                      zIndex: z,
                    }}
                  >
                    <Image
                      src={posterSrc(poster, 185)}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="180px"
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <span className="text-5xl font-bold">
              {list.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/5 bg-gradient-to-t from-black via-black/85 via-30% to-transparent" />

        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-4 pt-10">
          <p className="truncate text-base font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {list.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
            </span>
            {(list.type === "watchlist" || list.type === "server") && (
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                System
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

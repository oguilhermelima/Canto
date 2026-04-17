"use client";

import Link from "next/link";
import Image from "next/image";

function posterSrc(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w342${path}`;
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

  return (
    <Link
      href={`/collection/${list.slug}`}
      className="group relative flex w-[260px] shrink-0 overflow-hidden rounded-xl transition-[box-shadow] duration-200 hover:z-10 hover:ring-2 hover:ring-foreground/20 sm:w-[280px] lg:w-[300px]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {posters.length >= 3 ? (
          <div className="grid h-full w-full grid-cols-3">
            {posters.slice(0, 3).map((poster, i) => (
              <div key={`${poster}-${i}`} className="relative h-full overflow-hidden">
                <Image
                  src={posterSrc(poster)}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  sizes="100px"
                />
              </div>
            ))}
          </div>
        ) : posters.length > 0 ? (
          <Image
            src={posterSrc(posters[0]!)}
            alt=""
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            sizes="300px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <span className="text-3xl font-bold">
              {list.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
          <p className="truncate text-sm font-semibold text-white">
            {list.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-white/70">
              {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
            </span>
            {(list.type === "watchlist" || list.type === "server") && (
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                System
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

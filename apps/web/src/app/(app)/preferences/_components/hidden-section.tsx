"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Eye, Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { useHiddenMedia } from "~/hooks/use-hidden-media";
import { StateMessage } from "~/components/layout/state-message";
import { SettingsSection } from "~/components/settings/shared";

export function HiddenSection(): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { unhide } = useHiddenMedia();

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getHiddenMedia.useInfiniteQuery(
    { limit: 24 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) handleFetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleFetchNextPage]);

  return (
    <SettingsSection
      title="Hidden Media"
      description="Items hidden from recommendations, search, and browse. Click to restore."
    >
      {isError ? (
        <StateMessage preset="error" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hidden items yet. Items you hide will appear here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
            {items.map((item) => (
              <HiddenMediaCard
                key={`${item.provider}-${item.externalId}`}
                item={item}
                onUnhide={() => unhide(item.externalId, item.provider)}
              />
            ))}
          </div>

          <div ref={sentinelRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}

function HiddenMediaCard({
  item,
  onUnhide,
}: {
  item: { externalId: number; provider: string; type: string; title: string; posterPath: string | null };
  onUnhide: () => void;
}): React.JSX.Element {
  return (
    <div className="group relative flex flex-col">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted">
        {item.posterPath ? (
          <img
            src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
            alt={item.title}
            className="h-full w-full object-cover opacity-50"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/20">
            <span className="text-3xl font-bold">{item.title.charAt(0)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onUnhide}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/15 backdrop-blur-md">
            <Eye className="h-5 w-5 text-white" />
          </div>
          <span className="text-xs font-medium text-white">Unhide</span>
        </button>
      </div>
      <div className="mt-2 px-0.5">
        <p className="line-clamp-2 text-xs font-medium leading-tight text-muted-foreground">
          {item.title}
        </p>
      </div>
    </div>
  );
}

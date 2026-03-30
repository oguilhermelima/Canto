import { Film, Tv } from "lucide-react";

export interface WatchProviderItem {
  providerId: number;
  providerName: string;
  logoPath: string;
}

function getProviderSearchUrl(
  providerId: number,
  title: string,
  links: Record<number, string>,
  fallback?: string,
): string | undefined {
  const template = links[providerId];
  if (template) return template.replace("{title}", encodeURIComponent(title));
  return fallback;
}

export function WhereToWatch({
  mediaId,
  mediaTitle,
  flatrateProviders,
  rentBuyProviders,
  watchLink,
  watchProviderLinks,
  servers,
}: {
  mediaId: string;
  mediaTitle: string;
  flatrateProviders: WatchProviderItem[];
  rentBuyProviders: WatchProviderItem[];
  watchLink: string | undefined;
  watchProviderLinks: Record<number, string>;
  servers?: { jellyfin?: { url: string }; plex?: { url: string } } | null;
}): React.JSX.Element | null {
  const hasProviders = flatrateProviders.length > 0 || rentBuyProviders.length > 0;
  const hasServers = servers?.jellyfin || servers?.plex;

  if (!hasProviders && !hasServers) return null;

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
        Where to Watch
      </h2>
      <div className="flex flex-col gap-5">
        {/* Your Library (Jellyfin/Plex) */}
        {hasServers && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Your Library
            </p>
            <div className="-my-2 flex gap-3 overflow-x-auto py-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {servers.jellyfin && (
                <a
                  href={servers.jellyfin.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Jellyfin"
                  className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[#00a4dc] px-4 text-white transition-transform hover:scale-105"
                >
                  <Film className="h-5 w-5" />
                  <span className="text-sm font-medium">Jellyfin</span>
                </a>
              )}
              {servers.plex && (
                <a
                  href={servers.plex.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Plex"
                  className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[#e5a00d] px-4 text-black transition-transform hover:scale-105"
                >
                  <Tv className="h-5 w-5" />
                  <span className="text-sm font-medium">Plex</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Stream */}
        {flatrateProviders.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Stream
            </p>
            <div className="-my-2 flex gap-3 overflow-x-auto py-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {flatrateProviders.map((wp) => (
                <a
                  key={wp.providerId}
                  href={getProviderSearchUrl(wp.providerId, mediaTitle, watchProviderLinks, watchLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={wp.providerName}
                  className="shrink-0 overflow-hidden rounded-xl transition-transform hover:scale-110"
                >
                  {wp.logoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://image.tmdb.org/t/p/w92${wp.logoPath}`} alt={wp.providerName} className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-[10px] font-bold text-muted-foreground">{wp.providerName.slice(0, 2)}</div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Rent / Buy */}
        {rentBuyProviders.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Rent / Buy
            </p>
            <div className="-my-2 flex gap-3 overflow-x-auto py-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {rentBuyProviders.map((wp) => (
                <a
                  key={wp.providerId}
                  href={getProviderSearchUrl(wp.providerId, mediaTitle, watchProviderLinks, watchLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={wp.providerName}
                  className="shrink-0 overflow-hidden rounded-xl transition-transform hover:scale-110"
                >
                  {wp.logoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://image.tmdb.org/t/p/w92${wp.logoPath}`} alt={wp.providerName} className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-[10px] font-bold text-muted-foreground">{wp.providerName.slice(0, 2)}</div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

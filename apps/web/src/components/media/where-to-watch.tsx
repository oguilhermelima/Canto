import Image from "next/image";

// Icons replaced with SVG masks from public/

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
                  className="flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-[#a95ce0]/25 bg-gradient-to-r from-[#a95ce0]/15 to-[#4bb8e8]/15 px-4 transition-colors hover:from-[#a95ce0]/25 hover:to-[#4bb8e8]/25"
                >
                  <span
                    className="inline-block h-5 w-5 shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #a95ce0, #4bb8e8)",
                      mask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                      WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                    }}
                  />
                  <span className="bg-gradient-to-r from-[#a95ce0] to-[#4bb8e8] bg-clip-text text-sm font-medium text-transparent">Jellyfin</span>
                </a>
              )}
              {servers.plex && (
                <a
                  href={servers.plex.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Plex"
                  className="flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-[#e5a00d]/25 bg-[#e5a00d]/15 px-4 transition-colors hover:bg-[#e5a00d]/25"
                >
                  <span
                    className="inline-block h-5 w-5 shrink-0 bg-[#e5a00d]"
                    style={{
                      mask: "url(/plex-logo.svg) center/contain no-repeat",
                      WebkitMask: "url(/plex-logo.svg) center/contain no-repeat",
                    }}
                  />
                  <span className="text-sm font-medium text-[#e5a00d]">Plex</span>
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
                    <Image src={`https://image.tmdb.org/t/p/w92${wp.logoPath}`} alt={wp.providerName} width={48} height={48} className="h-12 w-12 rounded-xl" />
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
                    <Image src={`https://image.tmdb.org/t/p/w92${wp.logoPath}`} alt={wp.providerName} width={48} height={48} className="h-12 w-12 rounded-xl" />
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

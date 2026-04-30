import { db } from "./client";
import { watchProviderLink } from "./schema";

const PROVIDERS: {
  providerId: number;
  providerName: string;
  searchUrlTemplate: string | null;
}[] = [
  // ─── Major global providers ───
  { providerId: 8, providerName: "Netflix", searchUrlTemplate: "https://www.netflix.com/search?q={title}" },
  { providerId: 1796, providerName: "Netflix Standard with Ads", searchUrlTemplate: "https://www.netflix.com/search?q={title}" },
  { providerId: 175, providerName: "Netflix Kids", searchUrlTemplate: "https://www.netflix.com/search?q={title}" },
  { providerId: 9, providerName: "Amazon Prime Video", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 119, providerName: "Amazon Prime Video", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 10, providerName: "Amazon Video", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2100, providerName: "Amazon Prime Video with Ads", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 350, providerName: "Apple TV Plus", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 2, providerName: "Apple TV", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 337, providerName: "Disney Plus", searchUrlTemplate: "https://www.disneyplus.com/search/{title}" },
  { providerId: 1899, providerName: "Max", searchUrlTemplate: "https://play.max.com/search?q={title}" },
  { providerId: 15, providerName: "Hulu", searchUrlTemplate: "https://www.hulu.com/search?q={title}" },
  { providerId: 531, providerName: "Paramount Plus", searchUrlTemplate: "https://www.paramountplus.com/search/?q={title}" },
  { providerId: 2303, providerName: "Paramount Plus Premium", searchUrlTemplate: "https://www.paramountplus.com/search/?q={title}" },
  { providerId: 2616, providerName: "Paramount Plus Essential", searchUrlTemplate: "https://www.paramountplus.com/search/?q={title}" },
  { providerId: 386, providerName: "Peacock", searchUrlTemplate: "https://www.peacocktv.com/search?q={title}" },
  { providerId: 283, providerName: "Crunchyroll", searchUrlTemplate: "https://www.crunchyroll.com/search?q={title}" },
  { providerId: 3, providerName: "Google Play Movies", searchUrlTemplate: "https://play.google.com/store/search?q={title}&c=movies" },
  { providerId: 192, providerName: "YouTube", searchUrlTemplate: "https://www.youtube.com/results?search_query={title}" },
  { providerId: 188, providerName: "YouTube Premium", searchUrlTemplate: "https://www.youtube.com/results?search_query={title}" },
  { providerId: 235, providerName: "YouTube Free", searchUrlTemplate: "https://www.youtube.com/results?search_query={title}" },
  { providerId: 11, providerName: "MUBI", searchUrlTemplate: "https://mubi.com/search?query={title}" },
  { providerId: 538, providerName: "Plex", searchUrlTemplate: "https://watch.plex.tv/search?query={title}" },
  { providerId: 2077, providerName: "Plex Channel", searchUrlTemplate: "https://watch.plex.tv/search?query={title}" },
  { providerId: 300, providerName: "Pluto TV", searchUrlTemplate: "https://pluto.tv/search/details?query={title}" },
  { providerId: 526, providerName: "AMC+", searchUrlTemplate: "https://www.amcplus.com/search?q={title}" },
  { providerId: 80, providerName: "AMC", searchUrlTemplate: "https://www.amcplus.com/search?q={title}" },
  { providerId: 43, providerName: "Starz", searchUrlTemplate: "https://www.starz.com/search?query={title}" },
  { providerId: 34, providerName: "MGM Plus", searchUrlTemplate: "https://www.mgmplus.com/search?q={title}" },
  { providerId: 258, providerName: "Criterion Channel", searchUrlTemplate: "https://www.criterionchannel.com/search?q={title}" },
  { providerId: 257, providerName: "fuboTV", searchUrlTemplate: "https://www.fubo.tv/search/{title}" },
  { providerId: 207, providerName: "The Roku Channel", searchUrlTemplate: "https://therokuchannel.roku.com/search/{title}" },
  { providerId: 344, providerName: "Rakuten Viki", searchUrlTemplate: "https://www.viki.com/search?q={title}" },
  { providerId: 430, providerName: "HiDive", searchUrlTemplate: "https://www.hidive.com/search?q={title}" },
  { providerId: 151, providerName: "BritBox", searchUrlTemplate: "https://www.britbox.com/search?query={title}" },
  { providerId: 99, providerName: "Shudder", searchUrlTemplate: "https://www.shudder.com/search?q={title}" },
  { providerId: 87, providerName: "Acorn TV", searchUrlTemplate: "https://www.acorn.tv/search?q={title}" },
  { providerId: 143, providerName: "Sundance Now", searchUrlTemplate: "https://www.sundancenow.com/search?q={title}" },
  { providerId: 251, providerName: "ALLBLK", searchUrlTemplate: "https://www.allblk.tv/search?q={title}" },
  { providerId: 457, providerName: "VIX", searchUrlTemplate: "https://www.vix.com/search?q={title}" },
  { providerId: 7, providerName: "Fandango At Home", searchUrlTemplate: "https://athome.fandango.com/search?q={title}" },
  { providerId: 332, providerName: "Fandango at Home Free", searchUrlTemplate: "https://athome.fandango.com/search?q={title}" },

  // ─── Brazil providers ───
  { providerId: 307, providerName: "Globoplay", searchUrlTemplate: "https://globoplay.globo.com/busca/?q={title}" },
  { providerId: 167, providerName: "Claro video", searchUrlTemplate: "https://www.clarovideo.com/busca?q={title}" },
  { providerId: 484, providerName: "Claro tv+", searchUrlTemplate: "https://www.clarovideo.com/busca?q={title}" },

  // ─── Amazon Channels → redirect to Prime Video search ───
  { providerId: 1825, providerName: "HBO Max Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 1968, providerName: "Crunchyroll Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 582, providerName: "Paramount+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 583, providerName: "MGM+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 584, providerName: "Discovery+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 528, providerName: "AMC+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 683, providerName: "Looke Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 608, providerName: "Love Nature Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 201, providerName: "MUBI Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 196, providerName: "AcornTV Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 197, providerName: "BritBox Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 199, providerName: "Fandor Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 202, providerName: "Screambox Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 205, providerName: "Sundance Now Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 289, providerName: "Cinemax Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 290, providerName: "Hallmark+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 291, providerName: "MZ Choice Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 293, providerName: "PBS Kids Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 294, providerName: "PBS Masterpiece Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 343, providerName: "Bet+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 603, providerName: "CuriosityStream Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 1889, providerName: "Universal+ Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2106, providerName: "Adrenalina Pura Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2141, providerName: "MGM Plus Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2156, providerName: "Telecine Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2157, providerName: "Reserva Imovision Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2158, providerName: "Stingray Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2159, providerName: "CurtaOn Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2356, providerName: "Filmelier Plus Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2488, providerName: "Box Brazil Play Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2161, providerName: "Sony One Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2605, providerName: "Diamond Films Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2607, providerName: "Arte Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2608, providerName: "Aquarius Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },
  { providerId: 2609, providerName: "Booh Amazon Channel", searchUrlTemplate: "https://www.primevideo.com/search?phrase={title}" },

  // ─── Apple TV Channels → redirect to Apple TV search ───
  { providerId: 1855, providerName: "Starz Apple TV Channel", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 1854, providerName: "AMC Plus Apple TV Channel", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 1852, providerName: "Britbox Apple TV Channel", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 2107, providerName: "Adrenalina Pura Apple TV Channel", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 2142, providerName: "MGM+ Apple TV Channel", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },
  { providerId: 2243, providerName: "Apple TV Amazon Channel", searchUrlTemplate: "https://tv.apple.com/search?term={title}" },

  // ─── Roku Premium Channels → redirect to Roku search ───
  { providerId: 633, providerName: "Paramount+ Roku Premium Channel", searchUrlTemplate: "https://therokuchannel.roku.com/search/{title}" },
  { providerId: 634, providerName: "Starz Roku Premium Channel", searchUrlTemplate: "https://therokuchannel.roku.com/search/{title}" },
  { providerId: 635, providerName: "AMC+ Roku Premium Channel", searchUrlTemplate: "https://therokuchannel.roku.com/search/{title}" },
  { providerId: 636, providerName: "MGM Plus Roku Premium Channel", searchUrlTemplate: "https://therokuchannel.roku.com/search/{title}" },

  // ─── Other providers with search ───
  { providerId: 190, providerName: "Curiosity Stream", searchUrlTemplate: "https://curiositystream.com/search?q={title}" },
  { providerId: 278, providerName: "Pure Flix", searchUrlTemplate: "https://www.pureflix.com/search?q={title}" },
  { providerId: 315, providerName: "Hoichoi", searchUrlTemplate: "https://www.hoichoi.tv/search?q={title}" },
  { providerId: 309, providerName: "Sun Nxt", searchUrlTemplate: "https://www.sunnxt.com/search?q={title}" },
  { providerId: 551, providerName: "Magellan TV", searchUrlTemplate: "https://www.magellantv.com/search?q={title}" },
  { providerId: 554, providerName: "BroadwayHD", searchUrlTemplate: "https://www.broadwayhd.com/search?q={title}" },
  { providerId: 1715, providerName: "Shahid VIP", searchUrlTemplate: "https://shahid.mbc.net/search?q={title}" },
  { providerId: 464, providerName: "Kocowa", searchUrlTemplate: "https://www.kocowa.com/search?q={title}" },
  { providerId: 2285, providerName: "JustWatch TV", searchUrlTemplate: "https://www.justwatch.com/search?q={title}" },
  { providerId: 2302, providerName: "Mercado Play", searchUrlTemplate: "https://play.mercadolivre.com.br/search?q={title}" },
];

async function seed(): Promise<void> {
  for (const link of PROVIDERS) {
    await db
      .insert(watchProviderLink)
      .values(link)
      .onConflictDoUpdate({
        target: watchProviderLink.providerId,
        set: {
          providerName: link.providerName,
          searchUrlTemplate: link.searchUrlTemplate,
        },
      });
  }
  console.warn(`Seeded ${PROVIDERS.length} watch provider links`);
  process.exit(0);
}

void seed();

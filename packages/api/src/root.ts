import { createCallerFactory, createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth";
import { jellyfinRouter } from "./routers/jellyfin";
import { libraryRouter } from "./routers/library";
import { mediaRouter } from "./routers/media";
import { plexRouter } from "./routers/plex";
import { providerRouter } from "./routers/provider";
import { settingsRouter } from "./routers/settings";
import { torrentRouter } from "./routers/torrent";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  jellyfin: jellyfinRouter,
  media: mediaRouter,
  library: libraryRouter,
  plex: plexRouter,
  torrent: torrentRouter,
  provider: providerRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);

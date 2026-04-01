import { createCallerFactory, createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth";
import { jellyfinRouter } from "./routers/jellyfin";
import { libraryRouter } from "./routers/library";
import { listRouter } from "./routers/list";
import { mediaRouter } from "./routers/media";
import { plexRouter } from "./routers/plex";
import { providerRouter } from "./routers/provider";
import { requestRouter } from "./routers/request";
import { settingsRouter } from "./routers/settings";
import { syncRouter } from "./routers/sync";
import { torrentRouter } from "./routers/torrent";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  jellyfin: jellyfinRouter,
  list: listRouter,
  media: mediaRouter,
  library: libraryRouter,
  plex: plexRouter,
  request: requestRouter,
  torrent: torrentRouter,
  provider: providerRouter,
  settings: settingsRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);

import { createCallerFactory, createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth";
import { folderRouter } from "./routers/folder";
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
import { userConnectionRouter } from "./routers/userConnection";
import { userMediaRouter } from "./routers/userMedia";
import { homeSectionRouter } from "./routers/homeSection";
import { profileSectionRouter } from "./routers/profileSection";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  folder: folderRouter,
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
  userConnection: userConnectionRouter,
  userMedia: userMediaRouter,
  homeSection: homeSectionRouter,
  profileSection: profileSectionRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);

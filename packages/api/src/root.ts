import { createCallerFactory, createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth";
import { downloadConfigRouter } from "./routers/download-config";
import { folderRouter } from "./routers/folder";
import { jellyfinRouter } from "./routers/jellyfin";
import { libraryRouter } from "./routers/library";
import { listRouter } from "./routers/list";
import { mediaRouter } from "./routers/media";
import { plexRouter } from "./routers/plex";
import { preferencesRouter } from "./routers/preferences";
import { providerRouter } from "./routers/provider";
import { qualityProfileRouter } from "./routers/quality-profile";
import { requestRouter } from "./routers/request";
import { settingsRouter } from "./routers/settings";
import { syncRouter } from "./routers/sync";
import { torrentRouter } from "./routers/torrent";
import { userConnectionRouter } from "./routers/userConnection";
import { userMediaRouter } from "./routers/userMedia";
import { homeSectionRouter } from "./routers/homeSection";
import { profileSectionRouter } from "./routers/profileSection";
import { publicProfileRouter } from "./routers/publicProfile";
import { systemRouter } from "./routers/system";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  downloadConfig: downloadConfigRouter,
  folder: folderRouter,
  jellyfin: jellyfinRouter,
  list: listRouter,
  media: mediaRouter,
  library: libraryRouter,
  plex: plexRouter,
  preferences: preferencesRouter,
  qualityProfile: qualityProfileRouter,
  request: requestRouter,
  torrent: torrentRouter,
  provider: providerRouter,
  settings: settingsRouter,
  sync: syncRouter,
  userConnection: userConnectionRouter,
  userMedia: userMediaRouter,
  homeSection: homeSectionRouter,
  profileSection: profileSectionRouter,
  publicProfile: publicProfileRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);

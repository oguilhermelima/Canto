export {
  authenticatePlex,
  loginPlex,
  createPlexPin,
  checkPlexPin,
  type PlexAuthResult,
} from "./authenticate/plex";
export { authenticateJellyfin, type JellyfinAuthResult } from "./authenticate/jellyfin";
export {
  startTraktDeviceAuth,
  completeTraktDeviceAuth,
  authenticateTrakt,
  type TraktDeviceAuthCheckResult,
  type CompleteTraktDeviceAuthDeps,
  type TraktAuthResult,
} from "./authenticate/trakt";

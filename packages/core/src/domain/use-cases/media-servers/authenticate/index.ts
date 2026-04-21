export {
  authenticatePlex,
  loginPlex,
  createPlexPin,
  checkPlexPin,
  type PlexAuthResult,
} from "./plex";
export { authenticateJellyfin, type JellyfinAuthResult } from "./jellyfin";
export {
  startTraktDeviceAuth,
  completeTraktDeviceAuth,
  authenticateTrakt,
  type TraktDeviceAuthCheckResult,
  type CompleteTraktDeviceAuthDeps,
  type TraktAuthResult,
} from "./trakt";

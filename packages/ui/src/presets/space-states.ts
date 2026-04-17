import {
  CheckCircle2,
  Heart,
  Orbit,
  Rocket,
  Star,
  Telescope,
  Radio,
  Satellite,
  SatelliteDish,
  MapPinOff,
  XCircle,
} from "lucide-react";

export const SPACE_STATES = {
  // Empty states — frame as "unexplored", never "empty"
  emptyWatchlist: {
    icon: Telescope,
    title: "Uncharted territory",
    description: "Point your telescope at something new — explore and save media to watch later.",
  },
  emptyCollections: {
    icon: Orbit,
    title: "No constellations yet",
    description: "Group your favorite stars together — create your first collection.",
  },
  emptyServerLibrary: {
    icon: Satellite,
    title: "Awaiting first signal",
    description: "Downloaded media will dock here once it arrives.",
  },
  emptyList: {
    icon: Rocket,
    title: "Ready for launch",
    description: "This collection is fueled up — start adding media to fill its orbit.",
  },
  emptySearch: {
    icon: Radio,
    title: "No transmissions found",
    description: "Try different frequencies — adjust your keywords or check the spelling.",
  },
  emptyRequests: {
    icon: SatelliteDish,
    title: "All clear on comms",
    description: "No incoming requests at this station.",
  },
  emptyRequestsUser: {
    icon: SatelliteDish,
    title: "All clear on comms",
    description: "You haven't sent any requests yet — browse media and request what you'd like.",
  },
  emptyTorrents: {
    icon: Satellite,
    title: "Docking bay is clear",
    description: "Downloads from media pages will appear here with real-time telemetry.",
  },
  emptyNotifications: {
    icon: Radio,
    title: "Radio silence",
    description: "Transmissions about downloads, imports, and updates will appear here.",
  },
  emptyDownloads: {
    icon: Satellite,
    title: "No active missions",
    description: "All spacecraft have landed — no downloads in progress.",
  },
  emptyPerson: {
    icon: MapPinOff,
    title: "Coordinates unknown",
    description: "This crew member wasn't found in any star chart.",
  },
  emptyCompleted: {
    icon: CheckCircle2,
    title: "No missions completed",
    description: "Finished media will dock at this station.",
  },
  emptyDropped: {
    icon: XCircle,
    title: "No missions aborted",
    description: "Media you've stopped tracking will appear here.",
  },
  emptyRatings: {
    icon: Star,
    title: "No transmissions scored",
    description: "Rate media to build your personal star chart.",
  },
  emptyReviews: {
    icon: Radio,
    title: "No transmissions received",
    description: "Be the first to broadcast your thoughts on this title.",
  },
  emptyFavorites: {
    icon: Heart,
    title: "No stars in your constellation",
    description: "Mark media as favorite to see them here.",
  },
  emptyGrid: {
    icon: Telescope,
    title: "No signals in this sector",
    description: "Try adjusting your filters or scanning a different region.",
  },
  emptyFiltered: {
    icon: Telescope,
    title: "No matching signals",
    description: "Try adjusting your filters to widen the search area.",
  },
  emptyContinueWatching: {
    icon: Radio,
    title: "No missions in flight",
    description: "Press play on Plex or Jellyfin — your active journeys will dock here.",
  },
  emptyWatchNext: {
    icon: Telescope,
    title: "Queue awaits coordinates",
    description: "Add titles to your Watchlist or Collections and we'll line them up for launch.",
  },
  emptyUpcoming: {
    icon: Satellite,
    title: "No stars on the horizon",
    description: "Add titles to your Watchlist or Collections to track upcoming release windows.",
  },

  // Error states — hopeful, mission-control vibe
  error: {
    icon: SatelliteDish,
    title: "Signal interference",
    description: "Mission control lost the connection — let's try re-establishing.",
  },
  errorSearch: {
    icon: Radio,
    title: "Transmission disrupted",
    description: "Something scrambled the signal — give it another shot.",
  },
  errorMedia: {
    icon: SatelliteDish,
    title: "Telemetry interrupted",
    description: "We lost the data feed — mission control is on standby.",
  },

  // End of items — adventurous
  endOfItems: {
    icon: Rocket,
    title: "Edge of the galaxy",
    description: "You've explored everything in this sector.",
  },

  // Not found
  notFound: {
    icon: MapPinOff,
    title: "Off the star chart",
    description: "These coordinates don't match any known location.",
  },
  notFoundList: {
    icon: MapPinOff,
    title: "Lost signal",
    description: "This collection may have been moved or removed from the star chart.",
  },
} as const;

export type SpaceStateKey = keyof typeof SPACE_STATES;

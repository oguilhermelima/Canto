export type ImportStep = "select-torrent" | "select-media";

export interface ClientTorrentItem {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  addedOn: number;
  completionOn: number;
  tracked: boolean;
  trackedTorrentId: string | null;
  trackedMediaId: string | null;
  trackedStatus: string | null;
}

export interface MediaSearchItem {
  externalId: number;
  provider: "tmdb" | "tvdb";
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage: number | null;
}

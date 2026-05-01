/* -------------------------------------------------------------------------- */
/*  Stream-level row shapes returned by Plex/Jellyfin metadata endpoints.    */
/*                                                                            */
/*  Owned by domain so use cases can normalize them without reaching into     */
/*  infra. Adapter functions return these shapes verbatim; the extractors    */
/*  in `use-cases/fetch-info/{plex,jellyfin}.ts` fold them into the           */
/*  provider-agnostic `MediaFileInfo`.                                       */
/* -------------------------------------------------------------------------- */

export interface PlexStreamEntry {
  /** 1 = video, 2 = audio, 3 = subtitle. */
  streamType: number;
  codec?: string;
  default?: boolean;
  selected?: boolean;
  language?: string;
  languageCode?: string;
  languageTag?: string;
  colorPrimaries?: string;
  colorTrc?: string;
  DOVIPresent?: boolean;
}

export interface PlexStreamPart {
  file?: string;
  size?: number;
  duration?: number;
  Stream?: PlexStreamEntry[];
}

export interface PlexStreamMedia {
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  bitrate?: number;
  duration?: number;
  height?: number;
  videoResolution?: string;
  videoDynamicRange?: string;
  videoDoViPresent?: boolean;
  Part?: PlexStreamPart[];
}

export interface PlexStreamMetadataItem {
  ratingKey: string;
  parentIndex?: number;
  index?: number;
  Media?: PlexStreamMedia[];
}

export interface JellyfinStreamMediaStream {
  Type: string;
  Codec?: string;
  Height?: number;
  Width?: number;
  BitDepth?: number;
  VideoRange?: string;
  VideoRangeType?: string;
  Language?: string;
  IsDefault?: boolean;
}

export interface JellyfinStreamMediaSource {
  Container?: string;
  Size?: number;
  Path?: string;
  Bitrate?: number;
  MediaStreams?: JellyfinStreamMediaStream[];
}

export interface JellyfinStreamItem {
  Id: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  RunTimeTicks?: number;
  MediaSources?: JellyfinStreamMediaSource[];
}

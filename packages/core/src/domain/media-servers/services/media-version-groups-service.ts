/* -------------------------------------------------------------------------- */
/*  Media version groups service                                              */
/*                                                                            */
/*  Drives the admin "Sync items" dialog. The repository primitive returns a  */
/*  flat join of (media_version × media); this service groups the rows by     */
/*  media id, applies tab filters, and paginates. Grouping is done in memory  */
/*  because the working set is a single user's server library.                */
/* -------------------------------------------------------------------------- */

import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type {
  MediaSummary,
  MediaVersionRow,
} from "@canto/core/domain/media-servers/types/media-version";
import type { ServerSource } from "@canto/core/domain/sync/types";

export type MediaVersionGroupsTab =
  | "all"
  | "imported"
  | "unmatched"
  | "failed";

export interface MediaVersionGroupsFilters {
  server?: ServerSource;
  tab: MediaVersionGroupsTab;
  search?: string;
}

/**
 * Version projection consumed by the frontend. Keeping this narrow — we only
 * surface the fields the dialog needs, so backend churn does not ripple out
 * to the React side every time the schema grows a new column.
 */
export interface MediaVersionGroupVersion {
  id: string;
  source: string;
  serverItemId: string;
  serverLinkId: string | null;
  serverItemTitle: string;
  serverItemPath: string | null;
  serverItemYear: number | null;
  result: string;
  reason: string | null;
  resolution: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hdr: string | null;
  primaryAudioLang: string | null;
  fileSize: number | null;
  tmdbId: number | null;
}

export interface MediaVersionGroup {
  media: MediaSummary | null;
  versions: MediaVersionGroupVersion[];
}

export interface MediaVersionGroupsPage {
  groups: MediaVersionGroup[];
  page: number;
  pageSize: number;
  totalGroups: number;
  totalVersions: number;
}

function projectVersion(row: MediaVersionRow): MediaVersionGroupVersion {
  return {
    id: row.id,
    source: row.source,
    serverItemId: row.serverItemId,
    serverLinkId: row.serverLinkId,
    serverItemTitle: row.serverItemTitle,
    serverItemPath: row.serverItemPath,
    serverItemYear: row.serverItemYear,
    result: row.result,
    reason: row.reason,
    resolution: row.resolution,
    videoCodec: row.videoCodec,
    audioCodec: row.audioCodec,
    hdr: row.hdr,
    primaryAudioLang: row.primaryAudioLang,
    fileSize: row.fileSize,
    tmdbId: row.tmdbId,
  };
}

function matchesTab(
  versions: MediaVersionGroupVersion[],
  media: MediaSummary | null,
  tab: MediaVersionGroupsTab,
): boolean {
  if (tab === "all") return true;
  if (tab === "unmatched") {
    return media === null;
  }
  if (tab === "failed") {
    if (media === null) return false;
    return versions.some((v) => v.result === "failed");
  }
  // tab === "imported": matched groups where every version is imported or skipped.
  if (media === null) return false;
  return versions.every(
    (v) => v.result === "imported" || v.result === "skipped",
  );
}

export interface ListMediaVersionGroupsDeps {
  mediaVersions: MediaVersionRepositoryPort;
}

/**
 * Fetch + group + filter + paginate. Returns groups plus the totals the UI
 * needs to render pagination. Each standalone unmatched row becomes its own
 * singleton group with `media = null`, so the frontend can render matched and
 * unmatched items through a single list structure.
 */
export async function listMediaVersionGroups(
  deps: ListMediaVersionGroupsDeps,
  language: string,
  filters: MediaVersionGroupsFilters,
  page: number,
  pageSize: number,
): Promise<MediaVersionGroupsPage> {
  const rows = await deps.mediaVersions.findWithMedia(language, {
    server: filters.server,
    search: filters.search,
  });

  const byMediaId = new Map<string, MediaVersionGroup>();
  const unmatchedGroups: MediaVersionGroup[] = [];

  for (const row of rows) {
    const version = projectVersion(row.version);
    if (row.media) {
      const existing = byMediaId.get(row.media.id);
      if (existing) {
        existing.versions.push(version);
      } else {
        byMediaId.set(row.media.id, {
          media: row.media,
          versions: [version],
        });
      }
    } else {
      unmatchedGroups.push({ media: null, versions: [version] });
    }
  }

  const matchedGroups = Array.from(byMediaId.values());
  const combined = [...matchedGroups, ...unmatchedGroups];
  const filtered = combined.filter((g) => matchesTab(g.versions, g.media, filters.tab));

  const totalGroups = filtered.length;
  const totalVersions = filtered.reduce((acc, g) => acc + g.versions.length, 0);

  const start = (page - 1) * pageSize;
  const groups = filtered.slice(start, start + pageSize);

  return { groups, page, pageSize, totalGroups, totalVersions };
}

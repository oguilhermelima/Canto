import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import {
  resolveFolder,
} from "@canto/core/domain/torrents/rules/folder-routing";
import type { RoutableMedia } from "@canto/core/domain/torrents/rules/folder-routing";

export interface RoutableMediaRow {
  id: string;
  type: string;
  libraryId: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
  originCountry: string[] | null;
  originalLanguage: string | null;
  contentRating: string | null;
  provider: string;
  year: number | null;
  runtime: number | null;
  voteAverage: number | null;
  status: string | null;
}

export interface ResolvedDownloadConfig {
  category: string;
  downloadPath: string | undefined;
  folderId: string | undefined;
}

export interface ResolveDownloadConfigDeps {
  folders: FoldersRepositoryPort;
  media: MediaRepositoryPort;
  extras: MediaExtrasRepositoryPort;
}

/**
 * Resolve download folder via:
 * 1. Explicit folderId from input
 * 2. Existing media.libraryId assignment
 * 3. Auto-resolve via rule engine
 * Persists the resolved folderId onto media for future reference.
 */
export async function resolveDownloadConfig(
  deps: ResolveDownloadConfigDeps,
  mediaRow: RoutableMediaRow,
  inputFolderId?: string,
): Promise<ResolvedDownloadConfig> {
  if (inputFolderId) {
    const folder = await deps.folders.findFolderById(inputFolderId);
    if (folder?.enabled) {
      if (mediaRow.libraryId !== folder.id) {
        await deps.media.updateMedia(mediaRow.id, { libraryId: folder.id });
      }
      return {
        category: folder.qbitCategory ?? "default",
        downloadPath: folder.downloadPath ?? undefined,
        folderId: folder.id,
      };
    }
  }

  if (mediaRow.libraryId) {
    const folder = await deps.folders.findFolderById(mediaRow.libraryId);
    if (folder?.enabled) {
      return {
        category: folder.qbitCategory ?? "default",
        downloadPath: folder.downloadPath ?? undefined,
        folderId: folder.id,
      };
    }
  }

  const [folders, watchProviders] = await Promise.all([
    deps.folders.findAllFolders(),
    deps.extras.findWatchProvidersByMediaId(mediaRow.id),
  ]);
  const routable: RoutableMedia = {
    type: mediaRow.type,
    genres: mediaRow.genres,
    genreIds: mediaRow.genreIds,
    originCountry: mediaRow.originCountry,
    originalLanguage: mediaRow.originalLanguage,
    contentRating: mediaRow.contentRating,
    provider: mediaRow.provider,
    year: mediaRow.year,
    runtime: mediaRow.runtime,
    voteAverage: mediaRow.voteAverage,
    status: mediaRow.status,
    watchProviders: watchProviders.map((w) => ({
      providerId: w.providerId,
      region: w.region,
    })),
  };
  const resolvedId = resolveFolder(folders, routable);
  const resolved = resolvedId
    ? (folders.find((f) => f.id === resolvedId) ?? null)
    : null;

  if (resolved && mediaRow.libraryId !== resolved.id) {
    await deps.media.updateMedia(mediaRow.id, { libraryId: resolved.id });
  }

  return {
    category: resolved?.qbitCategory ?? "default",
    downloadPath: resolved?.downloadPath ?? undefined,
    folderId: resolved?.id,
  };
}

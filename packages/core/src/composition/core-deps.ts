import type { Database } from "@canto/db/client";

import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import type { TraktAuthPort } from "@canto/core/domain/trakt/ports/trakt-auth.port";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import type { LibraryFeedRepositoryPort } from "@canto/core/domain/user-media/ports/library-feed-repository.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { UserRepositoryPort } from "@canto/core/domain/user/ports/user-repository.port";

import { makeFoldersRepository } from "@canto/core/infra/file-organization/folders-repository.adapter";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeServerCredentials } from "@canto/core/infra/media-servers/server-credentials.adapter";
import { makeUserConnectionRepository } from "@canto/core/infra/media-servers/user-connection-repository.adapter";
import { makeMediaAspectStateRepository } from "@canto/core/infra/media/media-aspect-state-repository.adapter";
import { makeMediaContentRatingRepository } from "@canto/core/infra/media/media-content-rating-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeMediaVersionRepository } from "@canto/core/infra/media/media-version-repository.adapter";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { makeNotificationsRepository } from "@canto/core/infra/notifications/notifications-repository.adapter";
import { makeRecommendationsRepository } from "@canto/core/infra/recommendations/recommendations-repository.adapter";
import { makeTorrentsRepository } from "@canto/core/infra/torrents/torrents-repository.adapter";
import { makeTraktAuth } from "@canto/core/infra/trakt/trakt-auth.adapter";
import { makeTraktRepository } from "@canto/core/infra/trakt/trakt-repository.adapter";
import { makeLibraryFeedRepository } from "@canto/core/infra/user-media/library-feed-repository.adapter";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeUserRepository } from "@canto/core/infra/user/user-repository.adapter";

import { makeCache } from "@canto/core/platform/cache/cache.adapter";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";

/**
 * The cross-cutting infra surface used by every entry point: repos for the
 * 16 vertically-sliced contexts plus the four platform ports (logger,
 * dispatcher, cache, filesystem) that reach across them.
 *
 * `PersistDeps` (media-specific persist pipeline) intentionally lives in a
 * separate factory — see {@link makePersistDeps}. Use whichever subset a
 * caller actually needs; this bag is the common starting point.
 */
export interface CoreDeps {
  // ── Repository ports (db-bound) ──
  media: MediaRepositoryPort;
  user: UserRepositoryPort;
  lists: ListsRepositoryPort;
  recommendations: RecommendationsRepositoryPort;
  notifications: NotificationsRepositoryPort;
  trakt: TraktRepositoryPort;
  userConnection: UserConnectionRepositoryPort;
  userMedia: UserMediaRepositoryPort;
  libraryFeed: LibraryFeedRepositoryPort;
  torrents: TorrentsRepositoryPort;
  folders: FoldersRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  mediaVersion: MediaVersionRepositoryPort;

  // ── Platform / shared ports ──
  credentials: ServerCredentialsPort;
  traktAuth: TraktAuthPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
  cache: CachePort;
  fileSystem: FileSystemPort;
}

/**
 * Compose every cross-cutting port a use case might need against `db`.
 *
 * Worker entry points and tRPC routers can call `buildCoreDeps(ctx.db)` once
 * and pass the result (or a subset spread) to each use case, instead of
 * threading 5–10 individual `make*Repository(ctx.db)` calls per handler.
 *
 * Mirrors the spirit of {@link makePersistDeps} but covers the broader
 * cross-context surface. Stays outside `domain/` so the domain layer keeps
 * referencing port interfaces only.
 */
export function buildCoreDeps(db: Database): CoreDeps {
  return {
    media: makeMediaRepository(db),
    user: makeUserRepository(db),
    lists: makeListsRepository(db),
    recommendations: makeRecommendationsRepository(db),
    notifications: makeNotificationsRepository(db),
    trakt: makeTraktRepository(db),
    userConnection: makeUserConnectionRepository(db),
    userMedia: makeUserMediaRepository(db),
    libraryFeed: makeLibraryFeedRepository(db),
    torrents: makeTorrentsRepository(db),
    folders: makeFoldersRepository(db),
    extras: makeMediaExtrasRepository(db),
    localization: makeMediaLocalizationRepository(db),
    aspectState: makeMediaAspectStateRepository(db),
    contentRating: makeMediaContentRatingRepository(db),
    mediaVersion: makeMediaVersionRepository(db),

    credentials: makeServerCredentials(),
    traktAuth: makeTraktAuth(),
    logger: makeConsoleLogger(),
    dispatcher: jobDispatcher,
    cache: makeCache(),
    fileSystem: createNodeFileSystemAdapter(),
  };
}

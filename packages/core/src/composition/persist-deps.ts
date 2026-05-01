import type { Database } from "@canto/db/client";
import type { PersistDeps } from "@canto/core/domain/media/use-cases/persist/core";
import { makeMediaAspectStateRepository } from "@canto/core/infra/media/media-aspect-state-repository.adapter";
import { makeMediaContentRatingRepository } from "@canto/core/infra/media/media-content-rating-repository.adapter";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";

/**
 * Compose the full set of ports the persist pipeline depends on, falling
 * back to the standard adapters for any field the caller does not
 * provide. Lives outside `domain/` so domain code can declare port
 * interfaces without referencing infra/platform adapters directly.
 *
 * Callers that already thread their own ports (api routers, worker jobs,
 * cross-context use cases) pass them via `partial`; everything else
 * resolves to a fresh adapter built against `db`.
 */
export function makePersistDeps(
  db: Database,
  partial?: Partial<PersistDeps>,
): PersistDeps {
  return {
    media: partial?.media ?? makeMediaRepository(db),
    localization:
      partial?.localization ?? makeMediaLocalizationRepository(db),
    aspectState: partial?.aspectState ?? makeMediaAspectStateRepository(db),
    contentRating:
      partial?.contentRating ?? makeMediaContentRatingRepository(db),
    extras: partial?.extras ?? makeMediaExtrasRepository(db),
    logger: partial?.logger ?? makeConsoleLogger(),
    dispatcher: partial?.dispatcher ?? jobDispatcher,
  };
}

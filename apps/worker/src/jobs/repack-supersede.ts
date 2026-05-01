import { db } from "@canto/db/client";

import { runRepackSupersede } from "@canto/core/domain/torrents/use-cases/run-repack-supersede";
import { applyAdminDownloadPolicy } from "@canto/core/domain/shared/rules/scoring-rules";
import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { makeTorrentsRepository } from "@canto/core/infra/torrents/torrents-repository.adapter";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";

import type { JobLogger } from "../lib/job-logger";

export async function handleRepackSupersede(log: JobLogger): Promise<void> {
  const indexers = await buildIndexers().catch(() => []);
  if (indexers.length === 0) {
    log.warn("indexers unavailable, skipping");
    return;
  }
  const qbClient = await getDownloadClient().catch(() => null);
  if (!qbClient) return;

  const torrents = makeTorrentsRepository(db);
  const config = await torrents.findDownloadConfig();
  const rules = applyAdminDownloadPolicy(config.rules, config.policy);
  const outcome = await runRepackSupersede(db, {
    indexers,
    qbClient,
    rules,
    logger: makeConsoleLogger(),
    torrents,
    media: makeMediaRepository(db),
    localization: makeMediaLocalizationRepository(db),
  });

  if (outcome.scanned === 0 && outcome.replaced === 0) return;
  for (const r of outcome.replacements) {
    log.info(
      { downloadId: r.downloadId, repack: r.newRepackCount },
      `superseded "${r.oldTitle}" → "${r.newTitle}"`,
    );
  }
  for (const f of outcome.failures) {
    log.warn(
      { downloadId: f.downloadId, err: f.error },
      `failed for "${f.title}"`,
    );
  }
  log.info(
    {
      scanned: outcome.scanned,
      replaced: outcome.replaced,
      skips: outcome.skips,
    },
    "done",
  );
}

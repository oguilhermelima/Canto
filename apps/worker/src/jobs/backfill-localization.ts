import { db } from "@canto/db/client";
import { backfillLocalization } from "@canto/core/domain/media/use-cases/backfill-localization";

export async function handleBackfillLocalization(): Promise<void> {
  const r = await backfillLocalization(db);
  console.log(
    `[backfill-localization] base=${r.mediasSeededFromBase} mediaTrans=${r.mediaTranslationsCopied} seasonTrans=${r.seasonTranslationsCopied} epTrans=${r.episodeTranslationsCopied}`,
  );
}

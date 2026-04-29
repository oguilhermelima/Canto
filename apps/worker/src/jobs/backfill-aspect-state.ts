import { db } from "@canto/db/client";
import { backfillAspectState } from "@canto/core/domain/media/use-cases/backfill-aspect-state";

export async function handleBackfillAspectState(): Promise<void> {
  const r = await backfillAspectState(db);
  console.log(
    `[backfill-aspect-state] processed ${r.mediasProcessed} medias, inserted ${r.rowsInserted} rows`,
  );
}

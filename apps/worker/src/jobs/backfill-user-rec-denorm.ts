import type { Database } from "@canto/db/client";
import { sql } from "drizzle-orm";

/**
 * One-shot backfill that denormalizes `media` columns onto existing
 * `user_recommendation` rows. Phase-2 perf migration shipped a denormalized
 * read path; rows written before the deploy still have NULL in the new
 * columns and would be skipped by `findUserRecommendations`
 * (`title IS NOT NULL` predicate). The daily rebuild safety-net heals stale
 * users within 24h, but this job lets an operator force the catch-up
 * immediately for the whole table.
 *
 * The UPDATE pages by primary key to keep the working set bounded and
 * avoid locking the entire table on large installs.
 */
const CHUNK_SIZE = 5_000;

export async function handleBackfillUserRecDenorm(db: Database): Promise<void> {
  let cursor: string | null = null;
  let totalUpdated = 0;

  // Iterate by primary-key range to keep each statement bounded. The WHERE
  // covers two stale shapes:
  //  1. `title IS NULL` — pre-denorm rows from the first migration deploy.
  //  2. `overview IS NULL AND genres IS NULL` — rows from a deploy that
  //     ran between the title denorm and the overview/genres denorm.
  // Both heal idempotently in one pass.
   
  while (true) {
    const result = await db.execute(
      sql`
        WITH batch AS (
          SELECT ur.id
          FROM user_recommendation ur
          WHERE (ur.title IS NULL OR (ur.overview IS NULL AND ur.genres IS NULL))
            ${cursor ? sql`AND ur.id > ${cursor}` : sql``}
          ORDER BY ur.id
          LIMIT ${CHUNK_SIZE}
        ),
        upd AS (
          UPDATE user_recommendation ur
          SET
            external_id = m.external_id,
            provider = m.provider,
            type = m.type,
            title = COALESCE(ml.title, ''),
            overview = ml.overview,
            poster_path = ml.poster_path,
            backdrop_path = m.backdrop_path,
            logo_path = ml.logo_path,
            vote_average = m.vote_average,
            year = m.year,
            release_date = m.release_date,
            genres = m.genres,
            genre_ids = m.genre_ids,
            runtime = m.runtime,
            original_language = m.original_language,
            content_rating = m.content_rating,
            status = m.status,
            popularity = m.popularity
          FROM media m
          LEFT JOIN media_localization ml
            ON ml.media_id = m.id AND ml.language = 'en-US'
          WHERE ur.id IN (SELECT id FROM batch)
            AND ur.media_id = m.id
          RETURNING ur.id
        )
        SELECT
          (SELECT MAX(id::text) FROM upd) AS last_id,
          (SELECT COUNT(*)::int FROM upd) AS updated
      `,
    );
    const rows = result as unknown as Array<{ last_id: string | null; updated: number }>;

    const row = rows[0];
    const updated = row?.updated ?? 0;
    if (!updated || !row?.last_id) break;

    cursor = row.last_id;
    totalUpdated += updated;
    console.log(`[backfill-user-rec-denorm] Updated ${updated} rows (cursor=${cursor})`);

    if (updated < CHUNK_SIZE) break;
  }

  console.log(`[backfill-user-rec-denorm] Done — ${totalUpdated} rows backfilled`);
}

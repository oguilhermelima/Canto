import { sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaVideo } from "@canto/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { BecauseWatchedRec } from "@canto/core/domain/recommendations/types/because-watched";
import { toBecauseWatchedRec } from "@canto/core/infra/recommendations/because-watched.mapper";
import { findMediaLocalizedMany } from "@canto/core/infra/media/media-localized-repository";

interface RawRow extends Record<string, unknown> {
  sourceMediaId: string;
  mediaId: string;
  externalId: number;
  provider: string;
  type: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  year: number | null;
  releaseDate: string | null;
  genreIds: number[] | null;
  rn: number;
}

/**
 * Top-N recs per source media, using a single window-function query so the
 * cost is one round-trip regardless of how many sources we pass in.
 *
 * Excludes: anything in the global library, anything in the user's lists,
 * anything the user has dropped or rated low, and anything they've already
 * completed (don't suggest what they just watched).
 *
 * Translation overlay is applied via a follow-up batch query keyed on the
 * deduplicated rec mediaIds.
 */
export async function findBecauseWatchedRecs(
  db: Database,
  userId: string,
  sourceMediaIds: string[],
  mediaType: "movie" | "show" | undefined,
  perSourceLimit: number,
  language: string,
): Promise<BecauseWatchedRec[]> {
  if (sourceMediaIds.length === 0) return [];

  const mediaTypeClause = mediaType
    ? sql`AND m.type = ${mediaType}`
    : sql``;

  const sourceIdValues = sql.join(
    sourceMediaIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  // User-language values fall back to en-US so non-English speakers still get
  // results when their localization rows are missing, and recs whose only
  // localization is the user's own language aren't dropped just because en-US
  // hasn't been backfilled yet.
  const result = await db.execute<RawRow>(sql`
    WITH ranked AS (
      SELECT
        mr.source_media_id AS "sourceMediaId",
        m.id AS "mediaId",
        m.external_id AS "externalId",
        m.provider,
        m.type,
        COALESCE(ml_user.title, ml_en.title) AS "title",
        COALESCE(ml_user.poster_path, ml_en.poster_path) AS "posterPath",
        m.backdrop_path AS "backdropPath",
        COALESCE(ml_user.logo_path, ml_en.logo_path) AS "logoPath",
        COALESCE(ml_user.overview, ml_en.overview) AS "overview",
        m.vote_average AS "voteAverage",
        m.year,
        m.release_date AS "releaseDate",
        m.genre_ids AS "genreIds",
        ROW_NUMBER() OVER (
          PARTITION BY mr.source_media_id
          ORDER BY (
            COALESCE(m.vote_count, 0)::numeric * COALESCE(m.vote_average, 0)::numeric
            + 100::numeric * 6.5::numeric
          ) / (COALESCE(m.vote_count, 0)::numeric + 100::numeric) DESC
        ) AS rn
      FROM media_recommendation mr
      INNER JOIN media m ON m.id = mr.media_id
      LEFT JOIN media_localization ml_user
        ON ml_user.media_id = m.id AND ml_user.language = ${language}
      LEFT JOIN media_localization ml_en
        ON ml_en.media_id = m.id AND ml_en.language = 'en-US'
      WHERE mr.source_media_id IN (${sourceIdValues})
        AND COALESCE(m.vote_count, 0) >= 50
        AND COALESCE(ml_user.poster_path, ml_en.poster_path) IS NOT NULL
        ${mediaTypeClause}
        AND (m.release_date <= CURRENT_DATE OR m.release_date IS NULL)
        AND m.in_library = false
        AND NOT EXISTS (
          SELECT 1 FROM list_item li
          INNER JOIN list l ON l.id = li.list_id
          WHERE li.media_id = m.id
            AND l.user_id = ${userId}
            AND l.deleted_at IS NULL
            AND l.type != 'server'
            AND li.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_media_state ums
          WHERE ums.user_id = ${userId}
            AND ums.media_id = m.id
            AND (
              ums.status = 'completed'
              OR ums.status = 'dropped'
              OR (ums.rating IS NOT NULL AND ums.rating <= 3)
            )
        )
    )
    SELECT *
    FROM ranked
    WHERE rn <= ${perSourceLimit}
    ORDER BY "sourceMediaId", rn
  `);
  // postgres-js returns the rows directly as an iterable; pg would wrap
  // them in `{ rows: [] }`. Handle both shapes for safety.
  const rows: RawRow[] = Array.isArray(result)
    ? (result as unknown as RawRow[])
    : ((result as unknown as { rows?: RawRow[] }).rows ?? []);

  if (rows.length === 0) return [];

  // Trailer keys batched by the unique rec mediaIds.
  const recMediaIds = [...new Set(rows.map((r) => r.mediaId))];
  const trailerRows = await db
    .select({ mediaId: mediaVideo.mediaId, externalKey: mediaVideo.externalKey })
    .from(mediaVideo)
    .where(
      and(
        inArray(mediaVideo.mediaId, recMediaIds),
        eq(mediaVideo.type, "Trailer"),
        eq(mediaVideo.site, "YouTube"),
      ),
    );
  const trailerByMedia = new Map<string, string>();
  for (const t of trailerRows) {
    if (!trailerByMedia.has(t.mediaId)) trailerByMedia.set(t.mediaId, t.externalKey);
  }

  // Localization overlay — single batch query through the unified
  // `media_localization` read path. Resolves user-language values with en-US
  // fallback for every recommended media in one round trip.
  const localizedByMedia = new Map<
    string,
    {
      title: string;
      overview: string | null;
      posterPath: string | null;
      logoPath: string | null;
    }
  >();
  const localizedRows = await findMediaLocalizedMany(db, recMediaIds, language);
  for (const loc of localizedRows) {
    localizedByMedia.set(loc.id, {
      title: loc.title,
      overview: loc.overview,
      posterPath: loc.posterPath,
      logoPath: loc.logoPath,
    });
  }

  const out: BecauseWatchedRec[] = [];
  for (const r of rows) {
    const loc = localizedByMedia.get(r.mediaId);
    const rec = toBecauseWatchedRec({
      sourceMediaId: r.sourceMediaId,
      mediaId: r.mediaId,
      externalId: r.externalId,
      provider: r.provider,
      type: r.type,
      title: r.title,
      fallbackTitle: r.title,
      posterPath: r.posterPath,
      backdropPath: r.backdropPath,
      logoPath: r.logoPath,
      overview: r.overview,
      voteAverage: r.voteAverage,
      year: r.year,
      releaseDate: r.releaseDate,
      genreIds: r.genreIds,
      trailerKey: trailerByMedia.get(r.mediaId) ?? null,
      rank: r.rn,
      localizedTitle: loc?.title ?? null,
      localizedOverview: loc?.overview ?? null,
      localizedPosterPath: loc?.posterPath ?? null,
      localizedLogoPath: loc?.logoPath ?? null,
    });
    if (rec) out.push(rec);
  }
  return out;
}

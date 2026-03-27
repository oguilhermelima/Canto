import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { media, mediaFile } from "@canto/db/schema";
import { listInput } from "@canto/validators";

import { createTRPCRouter, publicProcedure } from "../trpc";

/* -------------------------------------------------------------------------- */
/*  Library Router                                                            */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   * Only returns items where in_library = true.
   */
  list: publicProcedure.input(listInput).query(async ({ ctx, input }) => {
    const page = input.page;
    const pageSize = input.pageSize;
    const offset = (page - 1) * pageSize;

    // Build WHERE conditions
    const conditions = [eq(media.inLibrary, true)];

    if (input.type) {
      conditions.push(eq(media.type, input.type));
    }

    if (input.genre) {
      conditions.push(
        sql`${media.genres}::jsonb @> ${JSON.stringify([input.genre])}::jsonb`,
      );
    }

    if (input.status) {
      conditions.push(eq(media.status, input.status));
    }

    if (input.yearMin) {
      conditions.push(gte(media.year, input.yearMin));
    }

    if (input.yearMax) {
      conditions.push(lte(media.year, input.yearMax));
    }

    if (input.language) {
      conditions.push(eq(media.originalLanguage, input.language));
    }

    if (input.scoreMin) {
      conditions.push(gte(media.voteAverage, input.scoreMin));
    }

    if (input.runtimeMax) {
      conditions.push(lte(media.runtime, input.runtimeMax));
    }

    if (input.contentRating) {
      conditions.push(eq(media.contentRating, input.contentRating));
    }

    if (input.network) {
      conditions.push(
        sql`${media.networks}::jsonb @> ${JSON.stringify([input.network])}::jsonb`,
      );
    }

    if (input.provider) {
      conditions.push(eq(media.provider, input.provider));
    }

    if (input.search) {
      conditions.push(ilike(media.title, `%${input.search}%`));
    }

    if (input.downloaded !== undefined) {
      if (input.downloaded) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM ${mediaFile} WHERE ${mediaFile.mediaId} = ${media.id})`,
        );
      } else {
        conditions.push(
          sql`NOT EXISTS (SELECT 1 FROM ${mediaFile} WHERE ${mediaFile.mediaId} = ${media.id})`,
        );
      }
    }

    const where = and(...conditions);

    // Determine sort direction
    const orderFn = input.sortOrder === "asc" ? asc : desc;

    // Build order by clause based on sort field
    function getOrderBy() {
      switch (input.sortBy) {
        case "title":
          return [orderFn(media.title)];
        case "year":
          return [orderFn(media.year)];
        case "voteAverage":
          return [orderFn(media.voteAverage)];
        case "popularity":
          return [orderFn(media.popularity)];
        case "releaseDate":
          return [orderFn(media.releaseDate)];
        case "addedAt":
        default:
          return [orderFn(media.addedAt)];
      }
    }

    // Execute queries in parallel
    const [items, [totalRow]] = await Promise.all([
      ctx.db.query.media.findMany({
        where,
        orderBy: getOrderBy(),
        limit: pageSize,
        offset,
      }),
      ctx.db.select({ total: count() }).from(media).where(where),
    ]);

    const total = totalRow?.total ?? 0;

    return {
      items,
      total,
      page,
      pageSize,
    };
  }),

  /**
   * Library statistics: counts of movies, shows, total, and storage usage.
   */
  stats: publicProcedure.query(async ({ ctx }) => {
    const [totalRow] = await ctx.db
      .select({ total: count() })
      .from(media)
      .where(eq(media.inLibrary, true));

    const [moviesRow] = await ctx.db
      .select({ total: count() })
      .from(media)
      .where(and(eq(media.inLibrary, true), eq(media.type, "movie")));

    const [showsRow] = await ctx.db
      .select({ total: count() })
      .from(media)
      .where(and(eq(media.inLibrary, true), eq(media.type, "show")));

    const [storageRow] = await ctx.db
      .select({
        totalBytes: sql<string>`COALESCE(SUM(${mediaFile.sizeBytes}), 0)`,
      })
      .from(mediaFile);

    return {
      total: totalRow?.total ?? 0,
      movies: moviesRow?.total ?? 0,
      shows: showsRow?.total ?? 0,
      storageBytes: BigInt(storageRow?.totalBytes ?? "0"),
    };
  }),
});

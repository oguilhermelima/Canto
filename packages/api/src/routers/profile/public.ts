import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { findPublicUserProfile } from "@canto/core/infra/user/user-repository";
import {
  findUserListsWithCounts,
  findPublicListBySlug,
  findListItems,
} from "@canto/core/infra/lists/list-repository";
import { findProfileSections } from "@canto/core/infra/profile/profile-section-repository";
import {
  findUserMediaPaginated,
  findUserMediaCounts,
} from "@canto/core/infra/user-media/library-feed-repository";
import { findUserWatchTimeStats } from "@canto/core/infra/user-media/stats-repository";
import {
  findUserTopGenres,
  findUserRecentActivity,
  findUserProfileInsights,
} from "@canto/core/infra/user-media/profile-insights-repository";
import { DEFAULT_PROFILE_SECTIONS } from "@canto/db/profile-section-defaults";

const idInput = z.object({ id: z.string().min(1) });
const slugInput = z.object({
  userId: z.string().min(1),
  slug: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Load + visibility-gate the target user. Owner bypasses the `isPublic` gate
 * so that a self-lookup via /profile/[ownId] still works.
 */
async function requireVisibleUser(
  db: Parameters<typeof findPublicUserProfile>[0],
  targetUserId: string,
  viewerUserId: string,
) {
  const profile = await findPublicUserProfile(db, targetUserId);
  if (!profile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
  }
  const isOwner = profile.id === viewerUserId;
  if (!profile.isPublic && !isOwner) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
  }
  return { profile, isOwner };
}

export const publicProfileRouter = createTRPCRouter({
  get: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const { profile, isOwner } = await requireVisibleUser(
      ctx.db,
      input.id,
      ctx.session.user.id,
    );
    return { profile, isOwner };
  }),

  getSections: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    await requireVisibleUser(ctx.db, input.id, ctx.session.user.id);
    const sections = await findProfileSections(ctx.db, input.id);
    // Fallback to defaults if target never seeded (avoid writing into their DB).
    if (sections.length === 0) {
      return {
        sections: DEFAULT_PROFILE_SECTIONS.map((d, i) => ({
          id: null,
          userId: input.id,
          position: i,
          sectionKey: d.sectionKey,
          title: d.title,
          config: d.config,
          enabled: d.enabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      };
    }
    return { sections };
  }),

  getCollections: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    await requireVisibleUser(ctx.db, input.id, ctx.session.user.id);
    // Localise preview posters using the *viewer's* language — the target
    // user's preference is irrelevant when rendering on the viewer's screen.
    const all = await findUserListsWithCounts(ctx.db, input.id, ctx.session.user.language);
    const publicOwned = all.filter(
      (l) => l.userId === input.id && l.visibility === "public",
    );
    return { lists: publicOwned };
  }),

  getCollectionBySlug: protectedProcedure
    .input(slugInput)
    .query(async ({ ctx, input }) => {
      await requireVisibleUser(ctx.db, input.userId, ctx.session.user.id);
      const listRow = await findPublicListBySlug(ctx.db, input.slug, input.userId);
      if (!listRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
      }
      const viewerLang = ctx.session.user.language;
      const { items, total } = await findListItems(ctx.db, listRow.id, viewerLang, {
        userId: ctx.session.user.id,
        limit: input.limit,
        offset: 0,
      });
      return { list: listRow, items, total };
    }),

  /**
   * Bundles everything the public overview needs. One roundtrip to keep the
   * read-only profile page simple.
   */
  getOverview: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    await requireVisibleUser(ctx.db, input.id, ctx.session.user.id);
    const userId = input.id;
    const viewerLang = ctx.session.user.language;

    const [
      stats,
      counts,
      genres,
      insights,
      recentActivity,
      watching,
      planned,
      favorites,
      recentCompleted,
      recentAny,
    ] = await Promise.all([
      findUserWatchTimeStats(ctx.db, userId, viewerLang),
      findUserMediaCounts(ctx.db, userId),
      findUserTopGenres(ctx.db, userId),
      findUserProfileInsights(ctx.db, userId, viewerLang),
      findUserRecentActivity(ctx.db, userId, viewerLang, 8),
      findUserMediaPaginated(ctx.db, userId, viewerLang, {
        status: "watching",
        limit: 12,
        sortBy: "updatedAt",
        sortOrder: "desc",
        offset: 0,
      }),
      findUserMediaPaginated(ctx.db, userId, viewerLang, {
        status: "planned",
        limit: 8,
        sortBy: "updatedAt",
        sortOrder: "desc",
        offset: 0,
      }),
      findUserMediaPaginated(ctx.db, userId, viewerLang, {
        isFavorite: true,
        limit: 50,
        sortBy: "rating",
        sortOrder: "desc",
        offset: 0,
      }),
      findUserMediaPaginated(ctx.db, userId, viewerLang, {
        status: "completed",
        limit: 24,
        sortBy: "updatedAt",
        sortOrder: "desc",
        offset: 0,
      }),
      findUserMediaPaginated(ctx.db, userId, viewerLang, {
        limit: 4,
        sortBy: "updatedAt",
        sortOrder: "desc",
        offset: 0,
      }),
    ]);

    return {
      stats,
      counts,
      genres,
      insights,
      recentActivity,
      watching: watching.items,
      planned: planned.items,
      favorites: favorites.items,
      recentCompleted: recentCompleted.items,
      recentAny: recentAny.items,
    };
  }),
});

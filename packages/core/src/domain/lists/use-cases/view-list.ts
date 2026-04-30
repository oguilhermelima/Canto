import type { Database } from "@canto/db/client";
import type { GetListBySlugInput } from "@canto/validators";
import { ListNotFoundError } from "@canto/core/domain/lists/errors";
import {
  findListBySlug,
  findListItems,
} from "../../../infra/lists/list-repository";

/**
 * `userLang` is supplied by the caller (read from `ctx.session.user.language`
 * in tRPC procedures) — the previous shape did a `SELECT language FROM user`
 * per list-page render even though every caller already had the value.
 *
 * After Phase 1C-δ the repository overlays media_localization inline so no
 * post-call overlay is required.
 */
export async function viewListBySlug(
  db: Database,
  userId: string,
  userLang: string,
  input: GetListBySlugInput,
) {
  const listRow = await findListBySlug(db, input.slug, userId);
  if (!listRow) throw new ListNotFoundError();

  const { items, total } = await findListItems(db, listRow.id, userLang, {
    userId,
    limit: input.limit,
    offset: input.cursor ?? input.offset,
    q: input.q,
    genreIds: input.genreIds,
    genreMode: input.genreMode ?? "or",
    language: input.language,
    scoreMin: input.scoreMin,
    scoreMax: input.scoreMax,
    yearMin: input.yearMin,
    yearMax: input.yearMax,
    runtimeMin: input.runtimeMin,
    runtimeMax: input.runtimeMax,
    certification: input.certification,
    status: input.status,
    sortBy: input.sortBy ?? listRow.defaultSortBy,
    watchProviders: input.watchProviders,
    watchRegion: input.watchRegion,
    membersRatingMin: input.membersRatingMin,
    memberVoteCountMin: input.memberVoteCountMin,
    watchStatuses: input.watchStatuses,
    hideCompleted: input.hideCompleted ?? listRow.hideCompleted,
    hideDropped: input.hideDropped ?? listRow.hideDropped,
    showHidden: input.showHidden ?? listRow.showHidden,
  });

  return { list: listRow, items, total };
}

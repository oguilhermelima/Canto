import type { Database } from "@canto/db/client";
import type { GetListBySlugInput } from "@canto/validators";
import { ListNotFoundError } from "@canto/core/domain/lists/errors";
import {
  findListBySlug,
  findListItems,
} from "../../../infra/lists/list-repository";
import { translateMediaItems } from "../../shared/services/translation-service";

/**
 * `userLang` is supplied by the caller (read from `ctx.session.user.language`
 * in tRPC procedures) — the previous shape did a `SELECT language FROM user`
 * per list-page render even though every caller already had the value.
 */
export async function viewListBySlug(
  db: Database,
  userId: string,
  userLang: string,
  input: GetListBySlugInput,
) {
  const listRow = await findListBySlug(db, input.slug, userId);
  if (!listRow) throw new ListNotFoundError();

  const { items: rawItems, total } = await findListItems(db, listRow.id, {
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

  const translated = await translateMediaItems(
    db,
    rawItems.map((i) => i.media),
    userLang,
  );
  const items = rawItems.map((item, idx) => ({ ...item, media: translated[idx]! }));
  return { list: listRow, items, total };
}

import type { Database } from "@canto/db/client";
import type { GetListBySlugInput } from "@canto/validators";
import { ListNotFoundError } from "@canto/core/domain/lists/errors";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { findListItems } from "@canto/core/infra/lists/list-repository";

/**
 * Partial port (Wave 3): the slug-resolution side goes through
 * `ListsRepositoryPort`; the heavy `findListItems` aggregation (joins media +
 * user_media_state + member-vote subquery) stays as a direct infra call until
 * a follow-up wave lifts it into the port.
 *
 * `userLang` is supplied by the caller (read from `ctx.session.user.language`
 * in tRPC procedures) — the previous shape did a `SELECT language FROM user`
 * per list-page render even though every caller already had the value.
 */
export interface ViewListDeps {
  repo: ListsRepositoryPort;
}

export async function viewListBySlug(
  deps: ViewListDeps,
  db: Database,
  userId: string,
  userLang: string,
  input: GetListBySlugInput,
) {
  const listRow = await deps.repo.findBySlug(input.slug, userId);
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

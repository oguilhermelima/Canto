import type { Database } from "@canto/db/client";
import type { GetAllCollectionItemsInput } from "@canto/validators";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { getCollectionLayout } from "@canto/core/domain/lists/use-cases/collection-layout";
import { findUserCustomCollectionItems } from "@canto/core/infra/lists/list-repository";

/**
 * Partial port (Wave 3): `findUserCustomCollectionItems` is a heavy
 * aggregating read across listItem ⨝ media ⨝ user_media_state and stays on
 * `db` until a future wave lifts it into the port. The collection-layout
 * resolution (which itself touches the file-organization user-pref store)
 * also stays direct.
 *
 * `userLang` is supplied by the caller (read from `ctx.session.user.language`
 * in tRPC procedures) so we don't `SELECT language FROM user` per page load.
 */
export interface ViewAllCollectionItemsDeps {
  repo: ListsRepositoryPort;
}

export async function viewAllCollectionItems(
  deps: ViewAllCollectionItemsDeps,
  db: Database,
  userId: string,
  userLang: string,
  input: GetAllCollectionItemsInput,
) {
  const layout = await getCollectionLayout(deps, db, userId, userLang);

  const { items, total } = await findUserCustomCollectionItems(
    db,
    userId,
    userLang,
    layout.hiddenListIds,
    {
      limit: input.limit,
      offset: input.cursor ?? 0,
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
      sortBy: input.sortBy,
      watchProviders: input.watchProviders,
      watchRegion: input.watchRegion,
      watchStatuses: input.watchStatuses,
      hideCompleted: input.hideCompleted,
      hideDropped: input.hideDropped,
      showHidden: input.showHidden,
    },
  );

  return { items, total };
}

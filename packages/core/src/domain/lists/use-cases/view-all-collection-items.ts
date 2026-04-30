import type { Database } from "@canto/db/client";
import type { GetAllCollectionItemsInput } from "@canto/validators";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { getCollectionLayout } from "@canto/core/domain/lists/use-cases/collection-layout";

/** `userLang` is supplied by the caller so we don't `SELECT language FROM
 *  user` per page load. */
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

  const { items, total } = await deps.repo.findUserCustomCollectionItems(
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

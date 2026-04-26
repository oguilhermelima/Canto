import type { Database } from "@canto/db/client";
import type { GetAllCollectionItemsInput } from "@canto/validators";
import { findUserCustomCollectionItems } from "../../../infra/lists/list-repository";
import { getCollectionLayout } from "./collection-layout";
import { translateMediaItems } from "../../shared/services/translation-service";

/**
 * `userLang` is supplied by the caller (read from `ctx.session.user.language`
 * in tRPC procedures) so we don't `SELECT language FROM user` per page load.
 */
export async function viewAllCollectionItems(
  db: Database,
  userId: string,
  userLang: string,
  input: GetAllCollectionItemsInput,
) {
  const layout = await getCollectionLayout(db, userId, userLang);

  const { items: rawItems, total } = await findUserCustomCollectionItems(
    db,
    userId,
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

  const translated = await translateMediaItems(
    db,
    rawItems.map((i) => i.media),
    userLang,
  );
  const items = rawItems.map((item, idx) => ({
    ...item,
    media: translated[idx]!,
  }));

  return { items, total };
}

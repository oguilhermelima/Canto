import type { Database } from "@canto/db/client";
import type { GetAllCollectionItemsInput } from "@canto/validators";
import { findUserCustomCollectionItems } from "../../../infra/lists/list-repository";
import { getCollectionLayout } from "./collection-layout";
import { getUserLanguage } from "../../shared/services/user-service";
import { translateMediaItems } from "../../shared/services/translation-service";

export async function viewAllCollectionItems(
  db: Database,
  userId: string,
  input: GetAllCollectionItemsInput,
) {
  const layout = await getCollectionLayout(db, userId);

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
      watchStatus: input.watchStatus,
    },
  );

  const userLang = await getUserLanguage(db, userId);
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

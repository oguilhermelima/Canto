import type { Database } from "@canto/db/client";
import type { GetListBySlugInput } from "@canto/validators";
import { ListNotFoundError } from "../../errors";
import {
  findListBySlug,
  findListItems,
} from "../../../infrastructure/repositories/lists/list";
import { getUserLanguage } from "../../services/user-service";
import { translateMediaItems } from "../../services/translation-service";

export async function viewListBySlug(
  db: Database,
  userId: string,
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
    sortBy: input.sortBy,
    watchProviders: input.watchProviders,
    watchRegion: input.watchRegion,
    membersRatingMin: input.membersRatingMin,
    memberVoteCountMin: input.memberVoteCountMin,
    watchStatus: input.watchStatus,
  });

  const userLang = await getUserLanguage(db, userId);
  const translated = await translateMediaItems(
    db,
    rawItems.map((i) => i.media),
    userLang,
  );
  const items = rawItems.map((item, idx) => ({ ...item, media: translated[idx]! }));
  return { list: listRow, items, total };
}

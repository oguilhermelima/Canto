import type { Database } from "@canto/db/client";
import type { UpdateCollectionLayoutInput } from "@canto/validators";
import { findUserListsWithCounts } from "../../../infrastructure/repositories/lists/list";
import {
  findUserPreferences,
  upsertUserPreference,
} from "../../../infrastructure/repositories/file-organization/library";
import {
  normalizeCollectionLayout,
  parseCollectionLayoutPreference,
  uniqueIds,
  type CollectionLayoutPreference,
} from "../../lists/rules/list-rules";

const COLLECTION_LAYOUT_PREF_KEY = "library.collectionLayout.v1";

type ListWithType = { id: string; type: string };

function collectValidListIds(lists: ListWithType[]): Set<string> {
  return new Set(
    lists
      .filter(
        (list) =>
          list.type === "watchlist" ||
          list.type === "custom" ||
          list.type === "server",
      )
      .map((list) => list.id),
  );
}

export async function getCollectionLayout(
  db: Database,
  userId: string,
): Promise<CollectionLayoutPreference> {
  const [preferences, lists] = await Promise.all([
    findUserPreferences(db, userId),
    findUserListsWithCounts(db, userId),
  ]);

  const preferencesRecord = preferences as Record<string, unknown>;
  const layout = parseCollectionLayoutPreference(
    preferencesRecord[COLLECTION_LAYOUT_PREF_KEY],
  );
  return normalizeCollectionLayout(layout, collectValidListIds(lists));
}

export async function updateCollectionLayout(
  db: Database,
  userId: string,
  input: UpdateCollectionLayoutInput,
): Promise<CollectionLayoutPreference> {
  const lists = await findUserListsWithCounts(db, userId);
  const normalized = normalizeCollectionLayout(
    { hiddenListIds: uniqueIds(input.hiddenListIds) },
    collectValidListIds(lists),
  );

  await upsertUserPreference(
    db,
    userId,
    COLLECTION_LAYOUT_PREF_KEY,
    normalized,
  );

  return normalized;
}

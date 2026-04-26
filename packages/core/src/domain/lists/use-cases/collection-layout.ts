import type { Database } from "@canto/db/client";
import type { UpdateCollectionLayoutInput } from "@canto/validators";
import { findUserListsWithCounts } from "../../../infra/lists/list-repository";
import {
  findUserPreferences,
  upsertUserPreference,
} from "../../../infra/file-organization/library-repository";
import {
  normalizeCollectionLayout,
  parseCollectionLayoutPreference,
  uniqueIds,
  type CollectionLayoutPreference,
} from "../rules/list-rules";

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
  userLang: string,
): Promise<CollectionLayoutPreference> {
  const [preferences, lists] = await Promise.all([
    findUserPreferences(db, userId),
    findUserListsWithCounts(db, userId, userLang),
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
  userLang: string,
  input: UpdateCollectionLayoutInput,
): Promise<CollectionLayoutPreference> {
  const lists = await findUserListsWithCounts(db, userId, userLang);
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

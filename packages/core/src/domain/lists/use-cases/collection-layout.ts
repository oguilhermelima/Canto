import type { Database } from "@canto/db/client";
import type { UpdateCollectionLayoutInput } from "@canto/validators";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { CollectionLayoutPreference } from "@canto/core/domain/lists/rules/list-rules";
import {
  normalizeCollectionLayout,
  parseCollectionLayoutPreference,
  uniqueIds,
} from "@canto/core/domain/lists/rules/list-rules";
import {
  findUserPreferences,
  upsertUserPreference,
} from "@canto/core/infra/file-organization/library-repository";
import { findUserListsWithCounts } from "@canto/core/infra/lists/list-repository";

/**
 * Partial port (Wave 3): the user-preference read/write goes through the
 * file-organization repository (other context, owns `user_preference` table)
 * and stays on `db`. `findUserListsWithCounts` is a heavy aggregating read
 * with media-localization joins; left on `db` until a future lists wave.
 */
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

export interface CollectionLayoutDeps {
  repo: ListsRepositoryPort;
}

export async function getCollectionLayout(
  _deps: CollectionLayoutDeps,
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
  _deps: CollectionLayoutDeps,
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

import type { UpdateCollectionLayoutInput } from "@canto/validators";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { CollectionLayoutPreference } from "@canto/core/domain/lists/rules/list-rules";
import {
  normalizeCollectionLayout,
  parseCollectionLayoutPreference,
  uniqueIds,
} from "@canto/core/domain/lists/rules/list-rules";

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
  deps: CollectionLayoutDeps,
  userId: string,
  userLang: string,
): Promise<CollectionLayoutPreference> {
  const [preferences, lists] = await Promise.all([
    deps.repo.findUserPreferences(userId),
    deps.repo.findUserListsWithCounts(userId, userLang),
  ]);

  const layout = parseCollectionLayoutPreference(
    preferences[COLLECTION_LAYOUT_PREF_KEY],
  );
  return normalizeCollectionLayout(layout, collectValidListIds(lists));
}

export async function updateCollectionLayout(
  deps: CollectionLayoutDeps,
  userId: string,
  userLang: string,
  input: UpdateCollectionLayoutInput,
): Promise<CollectionLayoutPreference> {
  const lists = await deps.repo.findUserListsWithCounts(userId, userLang);
  const normalized = normalizeCollectionLayout(
    { hiddenListIds: uniqueIds(input.hiddenListIds) },
    collectValidListIds(lists),
  );

  await deps.repo.upsertUserPreference(userId, COLLECTION_LAYOUT_PREF_KEY, normalized);

  return normalized;
}

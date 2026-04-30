import type { UpdateListInput } from "@canto/validators";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { verifyListOwnership } from "@canto/core/domain/lists/rules/list-rules";
import { slugify } from "@canto/core/domain/shared/rules/slugify";

export interface UpdateListDeps {
  repo: ListsRepositoryPort;
}

export async function updateListForUser(
  deps: UpdateListDeps,
  userId: string,
  userRole: string,
  input: UpdateListInput,
) {
  await verifyListOwnership(deps.repo, input.id, userId, userRole, {
    requiredPermission: "admin",
  });

  return deps.repo.update(input.id, {
    ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.defaultSortBy !== undefined ? { defaultSortBy: input.defaultSortBy } : {}),
    ...(input.groupByStatus !== undefined ? { groupByStatus: input.groupByStatus } : {}),
    ...(input.hideCompleted !== undefined ? { hideCompleted: input.hideCompleted } : {}),
    ...(input.hideDropped !== undefined ? { hideDropped: input.hideDropped } : {}),
    ...(input.showHidden !== undefined ? { showHidden: input.showHidden } : {}),
  });
}

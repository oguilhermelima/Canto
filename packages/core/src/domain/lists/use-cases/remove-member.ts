import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { verifyListOwnership } from "@canto/core/domain/lists/rules/list-rules";

export interface RemoveMemberDeps {
  repo: ListsRepositoryPort;
}

export async function removeMemberFromList(
  deps: RemoveMemberDeps,
  listId: string,
  targetUserId: string,
  actingUserId: string,
  actingUserRole: string,
) {
  const isSelf = targetUserId === actingUserId;
  if (!isSelf) {
    await verifyListOwnership(deps.repo, listId, actingUserId, actingUserRole, {
      requiredPermission: "admin",
    });
  } else {
    // Still ensure the list exists; use "view" so non-admins removing themselves don't trip the admin check.
    await verifyListOwnership(deps.repo, listId, actingUserId, actingUserRole, {
      requiredPermission: "view",
    });
  }
  await deps.repo.removeMember(listId, targetUserId);
  return { success: true };
}

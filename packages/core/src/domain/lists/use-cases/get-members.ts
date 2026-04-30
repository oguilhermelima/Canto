import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { verifyListOwnership } from "@canto/core/domain/lists/rules/list-rules";

export interface GetMembersDeps {
  repo: ListsRepositoryPort;
}

export async function getListSharing(
  deps: GetMembersDeps,
  listId: string,
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(deps.repo, listId, userId, userRole, {
    requiredPermission: "view",
  });

  const [members, invitations, listRow] = await Promise.all([
    deps.repo.findMembers(listId),
    deps.repo.findPendingInvitations(listId),
    deps.repo.findById(listId),
  ]);

  const owner = listRow?.userId
    ? await deps.repo.findOwnerSummary(listRow.userId)
    : null;

  return { members, invitations, owner };
}

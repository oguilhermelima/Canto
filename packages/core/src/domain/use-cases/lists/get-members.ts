import type { Database } from "@canto/db/client";
import { verifyListOwnership } from "../../lists/rules/list-rules";
import {
  findListById,
  findListOwnerSummary,
} from "../../../infrastructure/repositories/lists/list";
import {
  findListMembers,
  findPendingInvitations,
} from "../../../infrastructure/repositories/lists/member";

export async function getListSharing(
  db: Database,
  listId: string,
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(db, listId, userId, userRole, {
    requiredPermission: "view",
  });

  const [members, invitations, listRow] = await Promise.all([
    findListMembers(db, listId),
    findPendingInvitations(db, listId),
    findListById(db, listId),
  ]);

  const owner = listRow?.userId
    ? await findListOwnerSummary(db, listRow.userId)
    : null;

  return { members, invitations, owner };
}

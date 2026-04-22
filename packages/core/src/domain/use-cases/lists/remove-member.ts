import type { Database } from "@canto/db/client";
import { verifyListOwnership } from "../../lists/rules/list-rules";
import { removeListMember } from "../../../infrastructure/repositories/lists/member";

export async function removeMemberFromList(
  db: Database,
  listId: string,
  targetUserId: string,
  actingUserId: string,
  actingUserRole: string,
) {
  const isSelf = targetUserId === actingUserId;
  if (!isSelf) {
    await verifyListOwnership(db, listId, actingUserId, actingUserRole, {
      requiredPermission: "admin",
    });
  } else {
    // Still ensure the list exists; use "view" so non-admins removing themselves don't trip the admin check.
    await verifyListOwnership(db, listId, actingUserId, actingUserRole, {
      requiredPermission: "view",
    });
  }
  await removeListMember(db, listId, targetUserId);
  return { success: true };
}

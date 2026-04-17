import type { Database } from "@canto/db/client";
import {
  ListNotFoundError,
  ListPermissionError,
  SystemListModificationError,
} from "../errors";
import { findListById } from "../../infrastructure/repositories/list-repository";
import { findListMember } from "../../infrastructure/repositories/list-member-repository";

type PermissionLevel = "view" | "edit" | "admin";

const ROLE_PERMISSIONS: Record<string, PermissionLevel[]> = {
  viewer: ["view"],
  editor: ["view", "edit"],
  admin: ["view", "edit", "admin"],
};

export async function verifyListOwnership(
  db: Database,
  listId: string,
  userId: string,
  userRole: string,
  opts?: { allowSystem?: boolean; requiredPermission?: PermissionLevel },
) {
  const listRow = await findListById(db, listId);
  if (!listRow) throw new ListNotFoundError(listId);

  const requiredPerm = opts?.requiredPermission ?? "edit";

  if (listRow.type === "server" && userRole !== "admin") {
    throw new ListPermissionError("Only admins can modify server lists");
  }

  if (listRow.userId === userId) {
    if (!opts?.allowSystem && listRow.isSystem) {
      throw new SystemListModificationError();
    }
    return listRow;
  }

  if (listRow.type !== "server") {
    const membership = await findListMember(db, listId, userId);
    if (membership) {
      const permissions = ROLE_PERMISSIONS[membership.role] ?? [];
      if (permissions.includes(requiredPerm)) {
        if (!opts?.allowSystem && listRow.isSystem) {
          throw new SystemListModificationError();
        }
        return listRow;
      }
    }
    throw new ListPermissionError("Insufficient list permissions");
  }

  if (!opts?.allowSystem && listRow.isSystem) {
    throw new SystemListModificationError();
  }

  return listRow;
}

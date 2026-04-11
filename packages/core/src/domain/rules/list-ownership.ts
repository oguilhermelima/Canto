import { TRPCError } from "@trpc/server";
import type { Database } from "@canto/db/client";
import { findListById } from "../../infrastructure/repositories/list-repository";
import { findListMember } from "../../infrastructure/repositories/list-member-repository";

type PermissionLevel = "view" | "edit" | "admin";

const ROLE_PERMISSIONS: Record<string, PermissionLevel[]> = {
  viewer: ["view"],
  editor: ["view", "edit"],
  admin: ["view", "edit", "admin"],
};

/**
 * Verify list ownership and permissions for modification.
 * Throws TRPCError if the list is not found, not owned by the user,
 * or is a system list (for non-server operations).
 *
 * Also checks list member roles: editors can add/remove items,
 * admins can modify list settings and manage members.
 */
export async function verifyListOwnership(
  db: Database,
  listId: string,
  userId: string,
  userRole: string,
  opts?: { allowSystem?: boolean; requiredPermission?: PermissionLevel },
) {
  const listRow = await findListById(db, listId);
  if (!listRow) throw new TRPCError({ code: "NOT_FOUND" });

  const requiredPerm = opts?.requiredPermission ?? "edit";

  // For server lists, only admin can modify
  if (listRow.type === "server" && userRole !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  // Owner always has full access
  if (listRow.userId === userId) {
    // System lists cannot be edited/deleted (unless explicitly allowed)
    if (!opts?.allowSystem && listRow.isSystem) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify system lists" });
    }
    return listRow;
  }

  // Check if user is a member with sufficient permissions
  if (listRow.type !== "server") {
    const membership = await findListMember(db, listId, userId);
    if (membership) {
      const permissions = ROLE_PERMISSIONS[membership.role] ?? [];
      if (permissions.includes(requiredPerm)) {
        if (!opts?.allowSystem && listRow.isSystem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify system lists" });
        }
        return listRow;
      }
    }
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  // System lists cannot be edited/deleted (unless explicitly allowed)
  if (!opts?.allowSystem && listRow.isSystem) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify system lists" });
  }

  return listRow;
}

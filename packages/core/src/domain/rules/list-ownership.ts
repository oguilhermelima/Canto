import { TRPCError } from "@trpc/server";
import type { Database } from "@canto/db/client";
import { findListById } from "../../infrastructure/repositories/list-repository";

/**
 * Verify list ownership and permissions for modification.
 * Throws TRPCError if the list is not found, not owned by the user,
 * or is a system list (for non-server operations).
 */
export async function verifyListOwnership(
  db: Database,
  listId: string,
  userId: string,
  userRole: string,
  opts?: { allowSystem?: boolean },
) {
  const listRow = await findListById(db, listId);
  if (!listRow) throw new TRPCError({ code: "NOT_FOUND" });

  // For server lists, only admin can modify
  if (listRow.type === "server" && userRole !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  // For non-server lists, only the owner can modify
  if (listRow.type !== "server" && listRow.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  // System lists cannot be edited/deleted (unless explicitly allowed)
  if (!opts?.allowSystem && listRow.isSystem) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify system lists" });
  }

  return listRow;
}

import type { listMember } from "@canto/db/schema";
import type {
  ListMember,
  ListMemberId,
  ListMemberWithUser,
  MemberRole,
  NewListMember,
} from "@canto/core/domain/lists/types/list-member";

type ListMemberRow = typeof listMember.$inferSelect;

export function toDomain(row: ListMemberRow): ListMember {
  return {
    id: row.id as ListMemberId,
    listId: row.listId,
    userId: row.userId,
    role: row.role as MemberRole,
    createdAt: row.createdAt,
  };
}

export function toMemberWithUser(row: {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  userName: string;
  userEmail: string;
  userImage: string | null;
}): ListMemberWithUser {
  return {
    id: row.id as ListMemberId,
    userId: row.userId,
    role: row.role as MemberRole,
    createdAt: row.createdAt,
    userName: row.userName,
    userEmail: row.userEmail,
    userImage: row.userImage,
  };
}

/** Returns the explicit shape required by `addListMember` — `role` is
 *  mandatory at the function-signature level even though the DB column has
 *  a default, so we can't use `$inferInsert` (which makes `role` optional). */
export function toRow(input: NewListMember): {
  listId: string;
  userId: string;
  role: string;
} {
  return {
    listId: input.listId,
    userId: input.userId,
    role: input.role,
  };
}

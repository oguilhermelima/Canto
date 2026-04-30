import type { listInvitation } from "@canto/db/schema";
import type {
  InvitationStatus,
  ListInvitation,
  ListInvitationId,
  NewListInvitation,
  PendingInvitation,
} from "@canto/core/domain/lists/types/list-invitation";
import type { MemberRole } from "@canto/core/domain/lists/types/list-member";

type ListInvitationRow = typeof listInvitation.$inferSelect;

export function toDomain(row: ListInvitationRow): ListInvitation {
  return {
    id: row.id as ListInvitationId,
    listId: row.listId,
    invitedBy: row.invitedBy,
    invitedEmail: row.invitedEmail,
    invitedUserId: row.invitedUserId,
    role: row.role as MemberRole,
    token: row.token,
    status: row.status as InvitationStatus,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export function toPendingInvitation(row: {
  id: string;
  token: string;
  invitedEmail: string | null;
  invitedUserId: string | null;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}): PendingInvitation {
  return {
    id: row.id as ListInvitationId,
    token: row.token,
    invitedEmail: row.invitedEmail,
    invitedUserId: row.invitedUserId,
    role: row.role as MemberRole,
    status: row.status as InvitationStatus,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/** Note: `token` and `expiresAt` are filled by the underlying repo (it owns
 *  the secure-random token + 7-day window contract). The shape returned to
 *  the caller is a free-standing input that doesn't need them. */
export function toInvitationRow(input: NewListInvitation): {
  listId: string;
  invitedBy: string;
  invitedEmail?: string;
  invitedUserId?: string;
  role: string;
} {
  return {
    listId: input.listId,
    invitedBy: input.invitedBy,
    ...(input.invitedEmail ? { invitedEmail: input.invitedEmail } : {}),
    ...(input.invitedUserId ? { invitedUserId: input.invitedUserId } : {}),
    role: input.role,
  };
}

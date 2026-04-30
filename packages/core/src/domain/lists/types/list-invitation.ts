import type { MemberRole } from "@canto/core/domain/lists/types/list-member";

export type ListInvitationId = string & { readonly __brand: "ListInvitationId" };

/** Lifecycle states of a sharing invitation. `accepted` is terminal-success;
 *  `rejected` and `expired` are terminal-failure. `pending` is the only state
 *  the acceptance flow can transition out of. */
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired";

export interface ListInvitation {
  id: ListInvitationId;
  listId: string;
  invitedBy: string;
  invitedEmail: string | null;
  invitedUserId: string | null;
  role: MemberRole;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

/** Projection surfaced by the sharing dialog's "pending" tab — strips the
 *  back-pointer fields that are private to the invite-creation path. */
export interface PendingInvitation {
  id: ListInvitationId;
  token: string;
  invitedEmail: string | null;
  invitedUserId: string | null;
  role: MemberRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface NewListInvitation {
  listId: string;
  invitedBy: string;
  invitedEmail?: string | null;
  invitedUserId?: string | null;
  role: MemberRole;
}

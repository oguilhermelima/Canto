export type ListMemberId = string & { readonly __brand: "ListMemberId" };

/** Role granted to a non-owner participant of a list. The list `userId` is
 *  the implicit owner; everyone else carries one of these roles. Mirrors the
 *  schema CHECK / validator enum. */
export type MemberRole = "viewer" | "editor" | "admin";

export interface ListMember {
  id: ListMemberId;
  listId: string;
  userId: string;
  role: MemberRole;
  createdAt: Date;
}

/** Projection used by the sharing dialog — joins membership with the
 *  underlying user so the UI can render avatars without a second roundtrip. */
export interface ListMemberWithUser {
  id: ListMemberId;
  userId: string;
  role: MemberRole;
  createdAt: Date;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

export interface NewListMember {
  listId: string;
  userId: string;
  role: MemberRole;
}

export interface UpdateListMemberInput {
  role: MemberRole;
}

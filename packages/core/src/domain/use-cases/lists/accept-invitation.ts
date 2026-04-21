import type { Database } from "@canto/db/client";
import type { AcceptListInvitationInput } from "@canto/validators";
import {
  ListInvitationInvalidError,
  ListInvitationNotFoundError,
} from "../../errors";
import {
  acceptInvitation,
  addListMember,
  findInvitationByToken,
} from "../../../infrastructure/repositories/lists/member";

export async function acceptListInvitation(
  db: Database,
  userId: string,
  input: AcceptListInvitationInput,
) {
  const invitation = await findInvitationByToken(db, input.token);
  if (!invitation) throw new ListInvitationNotFoundError();
  if (invitation.status !== "pending") {
    throw new ListInvitationInvalidError("Invitation already used");
  }
  if (new Date() > invitation.expiresAt) {
    throw new ListInvitationInvalidError("Invitation expired");
  }

  await acceptInvitation(db, input.token);
  await addListMember(db, {
    listId: invitation.listId,
    userId,
    role: invitation.role,
  });

  return { success: true, listId: invitation.listId };
}

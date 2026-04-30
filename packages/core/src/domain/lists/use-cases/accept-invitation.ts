import type { AcceptListInvitationInput } from "@canto/validators";
import {
  ListInvitationInvalidError,
  ListInvitationNotFoundError,
} from "@canto/core/domain/lists/errors";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";

export interface AcceptInvitationDeps {
  repo: ListsRepositoryPort;
}

export async function acceptListInvitation(
  deps: AcceptInvitationDeps,
  userId: string,
  input: AcceptListInvitationInput,
) {
  const invitation = await deps.repo.findInvitationByToken(input.token);
  if (!invitation) throw new ListInvitationNotFoundError();
  if (invitation.status !== "pending") {
    throw new ListInvitationInvalidError("Invitation already used");
  }
  if (new Date() > invitation.expiresAt) {
    throw new ListInvitationInvalidError("Invitation expired");
  }

  await deps.repo.acceptInvitation(input.token);
  await deps.repo.addMember({
    listId: invitation.listId,
    userId,
    role: invitation.role,
  });

  return { success: true, listId: invitation.listId };
}

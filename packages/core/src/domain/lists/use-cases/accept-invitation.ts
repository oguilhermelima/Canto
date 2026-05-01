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
  // Wrap the read-then-write sequence so two concurrent acceptances of the
  // same token can't both flip status and both insert a membership row. The
  // pending-status guard runs inside the txn against the freshly-read
  // invitation, so the second caller sees `accepted` and bails before
  // `addMember` runs.
  return deps.repo.withTransaction(async (tx) => {
    const invitation = await tx.findInvitationByToken(input.token);
    if (!invitation) throw new ListInvitationNotFoundError();
    if (invitation.status !== "pending") {
      throw new ListInvitationInvalidError("Invitation already used");
    }
    if (new Date() > invitation.expiresAt) {
      throw new ListInvitationInvalidError("Invitation expired");
    }

    await tx.acceptInvitation(input.token);
    await tx.addMember({
      listId: invitation.listId,
      userId,
      role: invitation.role,
    });

    return { success: true, listId: invitation.listId };
  });
}

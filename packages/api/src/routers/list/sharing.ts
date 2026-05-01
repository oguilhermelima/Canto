import {
  acceptListInvitationInput,
  addListMemberInput,
  createListInvitationInput,
  getListMembersInput,
  getListVotesInput,
  removeListMemberInput,
  updateListMemberInput,
} from "@canto/validators";
import { verifyListOwnership } from "@canto/core/domain/lists/rules/list-rules";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { getListSharing } from "@canto/core/domain/lists/use-cases/get-members";
import { removeMemberFromList } from "@canto/core/domain/lists/use-cases/remove-member";
import { acceptListInvitation } from "@canto/core/domain/lists/use-cases/accept-invitation";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const listSharingRouter = createTRPCRouter({
  getMembers: protectedProcedure
    .input(getListMembersInput)
    .query(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return getListSharing(
        { repo },
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
      );
    }),

  addMember: protectedProcedure
    .input(addListMemberInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      await verifyListOwnership(
        repo,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "admin" },
      );
      return repo.addMember({
        listId: input.listId,
        userId: input.userId,
        role: input.role,
      });
    }),

  updateMember: protectedProcedure
    .input(updateListMemberInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      await verifyListOwnership(
        repo,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "admin" },
      );
      return repo.updateMemberRole(input.listId, input.userId, input.role);
    }),

  removeMember: protectedProcedure
    .input(removeListMemberInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return removeMemberFromList(
        { repo },
        input.listId,
        input.userId,
        ctx.session.user.id,
        ctx.session.user.role,
      );
    }),

  createInvitation: protectedProcedure
    .input(createListInvitationInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      await verifyListOwnership(
        repo,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "admin" },
      );
      return repo.createInvitation({
        listId: input.listId,
        invitedBy: ctx.session.user.id,
        invitedEmail: input.email,
        invitedUserId: input.userId,
        role: input.role,
      });
    }),

  acceptInvitation: protectedProcedure
    .input(acceptListInvitationInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return acceptListInvitation({ repo }, ctx.session.user.id, input);
    }),

  getVotes: protectedProcedure
    .input(getListVotesInput)
    .query(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      await verifyListOwnership(
        repo,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "view" },
      );
      return repo.listMemberVotes(input.listId, input.mediaIds);
    }),
});

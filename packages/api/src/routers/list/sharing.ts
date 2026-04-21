import {
  acceptListInvitationInput,
  addListMemberInput,
  createListInvitationInput,
  getListMembersInput,
  getListVotesInput,
  removeListMemberInput,
  updateListMemberInput,
} from "@canto/validators";
import { verifyListOwnership } from "@canto/core/domain/rules/list-rules";
import {
  addListMember,
  createInvitation,
  getListMemberVotes,
  updateListMemberRole,
} from "@canto/core/infrastructure/repositories/lists/member";
import { getListSharing } from "@canto/core/domain/use-cases/lists/get-members";
import { removeMemberFromList } from "@canto/core/domain/use-cases/lists/remove-member";
import { acceptListInvitation } from "@canto/core/domain/use-cases/lists/accept-invitation";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const listSharingRouter = createTRPCRouter({
  getMembers: protectedProcedure
    .input(getListMembersInput)
    .query(({ ctx, input }) =>
      getListSharing(
        ctx.db,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
      ),
    ),

  addMember: protectedProcedure
    .input(addListMemberInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(
        ctx.db,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "admin" },
      );
      return addListMember(ctx.db, {
        listId: input.listId,
        userId: input.userId,
        role: input.role,
      });
    }),

  updateMember: protectedProcedure
    .input(updateListMemberInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(
        ctx.db,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "admin" },
      );
      return updateListMemberRole(
        ctx.db,
        input.listId,
        input.userId,
        input.role,
      );
    }),

  removeMember: protectedProcedure
    .input(removeListMemberInput)
    .mutation(({ ctx, input }) =>
      removeMemberFromList(
        ctx.db,
        input.listId,
        input.userId,
        ctx.session.user.id,
        ctx.session.user.role,
      ),
    ),

  createInvitation: protectedProcedure
    .input(createListInvitationInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(
        ctx.db,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "admin" },
      );
      return createInvitation(ctx.db, {
        listId: input.listId,
        invitedBy: ctx.session.user.id,
        invitedEmail: input.email,
        invitedUserId: input.userId,
        role: input.role,
      });
    }),

  acceptInvitation: protectedProcedure
    .input(acceptListInvitationInput)
    .mutation(({ ctx, input }) =>
      acceptListInvitation(ctx.db, ctx.session.user.id, input),
    ),

  getVotes: protectedProcedure
    .input(getListVotesInput)
    .query(async ({ ctx, input }) => {
      await verifyListOwnership(
        ctx.db,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "view" },
      );
      return getListMemberVotes(ctx.db, input.listId, input.mediaIds);
    }),
});

import { adminDownloadPolicyInput } from "@canto/validators";
import {
  findDownloadConfig,
  upsertAdminDownloadPolicy,
} from "@canto/core/infra/torrents/download-config-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

/**
 * Server-wide download config — admin-only. Today this surfaces the
 * admin policy fields (preferred / avoided editions, AV1 stance);
 * future shipping of admin-tunable scoring rule overrides will land
 * under the same router.
 */
export const downloadConfigRouter = createTRPCRouter({
  getPolicy: adminProcedure.query(async ({ ctx }) => {
    const config = await findDownloadConfig(ctx.db);
    return config.policy;
  }),

  setPolicy: adminProcedure
    .input(adminDownloadPolicyInput)
    .mutation(({ ctx, input }) => upsertAdminDownloadPolicy(ctx.db, input)),
});

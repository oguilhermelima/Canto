import { createTRPCRouter } from "../../trpc";
import { preferencesDownloadsRouter } from "./downloads";

export const preferencesRouter = createTRPCRouter({
  downloads: preferencesDownloadsRouter,
});

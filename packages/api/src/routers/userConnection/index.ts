import { mergeRouters } from "../../trpc";
import { crudRouter } from "./crud";
import { oauthRouter } from "./oauth";
import { setupRouter } from "./setup";

export const userConnectionRouter = mergeRouters(crudRouter, setupRouter, oauthRouter);

import { t } from "../../trpc";
import { listManageRouter } from "./manage";
import { listItemsRouter } from "./items";
import { listSharingRouter } from "./sharing";

export const listRouter = t.mergeRouters(
  listManageRouter,
  listItemsRouter,
  listSharingRouter,
);

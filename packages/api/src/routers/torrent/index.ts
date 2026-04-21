import { mergeRouters } from "../../trpc";

import { torrentSearchRouter } from "./search";
import { torrentListRouter } from "./list";
import { torrentManageRouter } from "./manage";
import { torrentImportRouter } from "./import";

export const torrentRouter = mergeRouters(
  torrentSearchRouter,
  torrentListRouter,
  torrentManageRouter,
  torrentImportRouter,
);

import { t } from "../../trpc";
import { analyticsRouter } from "./analytics";
import { feedRouter } from "./feed";
import { hiddenRouter } from "./hidden";
import { historyRouter } from "./history";
import { ratingsRouter } from "./ratings";
import { stateRouter } from "./state";

export const userMediaRouter = t.mergeRouters(
  stateRouter,
  feedRouter,
  ratingsRouter,
  historyRouter,
  hiddenRouter,
  analyticsRouter,
);

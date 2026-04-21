import { t } from "../../trpc";

import { providerFiltersRouter } from "./filters";
import { providerDiscoveryRouter } from "./discovery";

export const providerRouter = t.mergeRouters(
  providerFiltersRouter,
  providerDiscoveryRouter,
);

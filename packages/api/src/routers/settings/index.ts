import { t } from "../../trpc";

import { settingsCoreRouter } from "./core";
import { settingsLanguagesRouter } from "./languages";
import { settingsServicesRouter } from "./services";

export const settingsRouter = t.mergeRouters(
  settingsCoreRouter,
  settingsLanguagesRouter,
  settingsServicesRouter,
);

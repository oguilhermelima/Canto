import type { JobDispatcherPort } from "../../domain/ports/job-dispatcher.port";
import {
  dispatchRefreshExtras,
  dispatchReconcileShow,
  dispatchTranslateEpisodes,
  dispatchRebuildUserRecs,
  dispatchRefreshAllLanguage,
} from "../queue/bullmq-dispatcher";

export const jobDispatcher: JobDispatcherPort = {
  refreshExtras: dispatchRefreshExtras,
  reconcileShow: dispatchReconcileShow,
  translateEpisodes: dispatchTranslateEpisodes,
  rebuildUserRecs: dispatchRebuildUserRecs,
  refreshAllLanguage: dispatchRefreshAllLanguage,
};

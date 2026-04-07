import type { JobDispatcherPort } from "../../domain/ports/job-dispatcher.port";
import {
  dispatchRefreshExtras,
  dispatchReconcileShow,
  dispatchMediaPipeline,
  dispatchTranslateEpisodes,
  dispatchRebuildUserRecs,
  dispatchRefreshAllLanguage,
} from "../queue/bullmq-dispatcher";

export const jobDispatcher: JobDispatcherPort = {
  refreshExtras: dispatchRefreshExtras,
  reconcileShow: dispatchReconcileShow,
  reprocessMedia: (mediaId, useTVDBSeasons) => dispatchMediaPipeline({ mediaId, useTVDBSeasons }),
  translateEpisodes: dispatchTranslateEpisodes,
  rebuildUserRecs: dispatchRebuildUserRecs,
  refreshAllLanguage: dispatchRefreshAllLanguage,
};

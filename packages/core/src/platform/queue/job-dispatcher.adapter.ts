import type { JobDispatcherPort } from "../../domain/shared/ports/job-dispatcher.port";
import {
  dispatchRefreshExtras,
  dispatchReconcileShow,
  dispatchMediaPipeline,
  dispatchTranslateEpisodes,
  dispatchRebuildUserRecs,
  dispatchRefreshAllLanguage,
  dispatchTraktSyncSection,
} from "./bullmq-dispatcher";

export const jobDispatcher: JobDispatcherPort = {
  refreshExtras: dispatchRefreshExtras,
  reconcileShow: dispatchReconcileShow,
  reprocessMedia: (mediaId, useTVDBSeasons) => dispatchMediaPipeline({ mediaId, useTVDBSeasons }),
  translateEpisodes: dispatchTranslateEpisodes,
  rebuildUserRecs: dispatchRebuildUserRecs,
  refreshAllLanguage: dispatchRefreshAllLanguage,
  traktSyncSection: dispatchTraktSyncSection,
};

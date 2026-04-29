import type { JobDispatcherPort } from "../../domain/shared/ports/job-dispatcher.port";
import {
  dispatchEnsureMedia,
  dispatchRebuildUserRecs,
  dispatchTraktSyncSection,
} from "./bullmq-dispatcher";

export const jobDispatcher: JobDispatcherPort = {
  enrichMedia: dispatchEnsureMedia,
  rebuildUserRecs: dispatchRebuildUserRecs,
  traktSyncSection: dispatchTraktSyncSection,
};

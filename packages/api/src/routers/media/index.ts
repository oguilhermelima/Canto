import { t } from "../../trpc";

import { mediaDiscoveryRouter } from "./discovery";
import { mediaMetadataRouter } from "./metadata";
import { mediaLibraryRouter } from "./library";
import { mediaVersioningRouter } from "./versioning";
import { mediaRebuildRouter } from "./rebuild";

export const mediaRouter = t.mergeRouters(
  mediaDiscoveryRouter,
  mediaMetadataRouter,
  mediaLibraryRouter,
  mediaVersioningRouter,
  mediaRebuildRouter,
);

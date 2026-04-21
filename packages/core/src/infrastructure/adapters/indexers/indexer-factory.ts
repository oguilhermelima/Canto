import { getSettings } from "@canto/db/settings";
import type { IndexerPort } from "../../../domain/ports/indexer";
import { getJackettClient } from "./jackett";
import { getProwlarrClient } from "./prowlarr";

export async function buildIndexers(): Promise<IndexerPort[]> {
  const indexers: IndexerPort[] = [];
  const { "prowlarr.enabled": prowlarrEnabled, "jackett.enabled": jackettEnabled } =
    await getSettings(["prowlarr.enabled", "jackett.enabled"]);
  if (prowlarrEnabled === true) indexers.push(await getProwlarrClient());
  if (jackettEnabled === true) indexers.push(await getJackettClient());
  return indexers;
}

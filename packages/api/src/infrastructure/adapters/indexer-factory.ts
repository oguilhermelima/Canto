import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import type { IndexerPort } from "../../domain/ports/indexer";
import { getJackettClient } from "./jackett";
import { getProwlarrClient } from "./prowlarr";

export async function buildIndexers(): Promise<IndexerPort[]> {
  const indexers: IndexerPort[] = [];
  const prowlarrEnabled = (await getSetting<boolean>(SETTINGS.PROWLARR_ENABLED)) === true;
  const jackettEnabled = (await getSetting<boolean>(SETTINGS.JACKETT_ENABLED)) === true;
  if (prowlarrEnabled) indexers.push(await getProwlarrClient());
  if (jackettEnabled) indexers.push(await getJackettClient());
  return indexers;
}

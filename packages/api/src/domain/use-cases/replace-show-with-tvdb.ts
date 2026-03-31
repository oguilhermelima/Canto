import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { findMediaById } from "../../infrastructure/repositories";
import { replaceMediaProvider } from "./replace-provider";

export async function replaceShowWithTvdb(
  db: Database,
  mediaId: string,
): Promise<void> {
  const tvdbDefault = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;
  if (!tvdbDefault) return;

  const row = await findMediaById(db, mediaId);
  if (!row || row.type !== "show" || row.provider === "tvdb") return;

  try {
    await replaceMediaProvider(db, mediaId, "tvdb");
    console.log(`[replace-tvdb] Replaced "${row.title}" with TVDB data`);
  } catch (err) {
    console.warn(`[replace-tvdb] Failed for "${row.title}":`, err instanceof Error ? err.message : err);
  }
}

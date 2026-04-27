import { z } from "zod";

export const av1Stance = z.enum(["neutral", "prefer", "avoid"]);
export type Av1Stance = z.infer<typeof av1Stance>;

/**
 * Per-user download preferences. Read by the torrent search use-case to
 * boost releases that match the user's languages, streaming services and
 * editions; ignored otherwise.
 */
export const downloadPreferencesInput = z.object({
  preferredLanguages: z.array(z.string().min(1).max(10)),
  preferredStreamingServices: z.array(z.string().min(1).max(20)),
  preferredEditions: z.array(z.string().min(1).max(60)),
  avoidedEditions: z.array(z.string().min(1).max(60)),
  /** AV1 codec stance. neutral keeps default scoring; prefer boosts AV1
   *  releases by +5; avoid penalises by -5. */
  av1Stance: av1Stance.default("neutral"),
});

export type DownloadPreferencesInput = z.infer<typeof downloadPreferencesInput>;

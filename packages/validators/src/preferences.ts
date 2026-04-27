import { z } from "zod";

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
});

export type DownloadPreferencesInput = z.infer<typeof downloadPreferencesInput>;

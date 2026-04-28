import { z } from "zod";

export const av1Stance = z.enum(["neutral", "prefer", "avoid"]);
export type Av1Stance = z.infer<typeof av1Stance>;

/**
 * Per-user download taste — languages and streaming services. Boosts
 * releases that match what the individual viewer wants to read or
 * stream from.
 */
export const downloadPreferencesInput = z.object({
  preferredLanguages: z.array(z.string().min(1).max(10)),
  preferredStreamingServices: z.array(z.string().min(1).max(20)),
});

export type DownloadPreferencesInput = z.infer<typeof downloadPreferencesInput>;

/**
 * Server-wide download policy. Editions and AV1 stance are admin-scoped
 * because they reflect what the household keeps on disk and what the
 * playback infra can decode — not personal taste.
 */
export const adminDownloadPolicyInput = z.object({
  preferredEditions: z.array(z.string().min(1).max(60)),
  avoidedEditions: z.array(z.string().min(1).max(60)),
  /** AV1 codec stance. neutral keeps default scoring; prefer boosts AV1
   *  releases; avoid penalises them. */
  av1Stance: av1Stance.default("neutral"),
});

export type AdminDownloadPolicyInput = z.infer<typeof adminDownloadPolicyInput>;

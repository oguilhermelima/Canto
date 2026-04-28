import { z } from "zod";
import { qualityType, sourceType } from "./torrent";

const releaseFlavor = z.enum(["movie", "show", "anime"]);

/**
 * Weight range. Stays within the same magnitude as the other rule
 * bonuses (HDR/audio/group/etc each cap around 10–13) so a profile entry
 * doesn't drown them out after the engine normalises to 0–100.
 * Recommended scale: 30 = baseline acceptable, 45 = top preference.
 */
export const allowedFormatEntry = z.object({
  quality: qualityType,
  source: sourceType,
  weight: z.number().int().min(0).max(100),
});

const baseDownloadProfileFields = {
  name: z.string().min(1).max(100),
  flavor: releaseFlavor,
  allowedFormats: z.array(allowedFormatEntry).min(1).max(64),
  cutoffQuality: qualityType.nullable(),
  cutoffSource: sourceType.nullable(),
  minTotalScore: z.number().int().min(0).max(100).default(0),
  /** Per-profile preferred languages (ISO codes). Boost matching
   *  releases; with `languageStrict`, also reject non-matches. */
  languages: z.array(z.string().min(2).max(10)).default([]),
  languageStrict: z.boolean().default(false),
};

export const createDownloadProfileInput = z.object(baseDownloadProfileFields);

export const updateDownloadProfileInput = z.object({
  id: z.string().uuid(),
  ...baseDownloadProfileFields,
});

export const setDefaultDownloadProfileInput = z.object({
  id: z.string().uuid(),
});

export const deleteDownloadProfileInput = z.object({
  id: z.string().uuid(),
});

export const listDownloadProfilesInput = z.object({
  flavor: releaseFlavor.optional(),
});

export type CreateDownloadProfileInput = z.infer<
  typeof createDownloadProfileInput
>;
export type UpdateDownloadProfileInput = z.infer<
  typeof updateDownloadProfileInput
>;
export type AllowedFormatEntry = z.infer<typeof allowedFormatEntry>;

import { z } from "zod";
import { qualityType, sourceType } from "./torrent";

const releaseFlavor = z.enum(["movie", "show", "anime"]);

export const allowedFormatEntry = z.object({
  quality: qualityType,
  source: sourceType,
  weight: z.number().int().min(0).max(10000),
});

const baseQualityProfileFields = {
  name: z.string().min(1).max(100),
  flavor: releaseFlavor,
  allowedFormats: z.array(allowedFormatEntry).min(1).max(64),
  cutoffQuality: qualityType.nullable(),
  cutoffSource: sourceType.nullable(),
  minTotalScore: z.number().int().min(0).max(100).default(0),
};

export const createQualityProfileInput = z.object(baseQualityProfileFields);

export const updateQualityProfileInput = z.object({
  id: z.string().uuid(),
  ...baseQualityProfileFields,
});

export const setDefaultQualityProfileInput = z.object({
  id: z.string().uuid(),
});

export const deleteQualityProfileInput = z.object({
  id: z.string().uuid(),
});

export const listQualityProfilesInput = z.object({
  flavor: releaseFlavor.optional(),
});

export type CreateQualityProfileInput = z.infer<
  typeof createQualityProfileInput
>;
export type UpdateQualityProfileInput = z.infer<
  typeof updateQualityProfileInput
>;
export type AllowedFormatEntry = z.infer<typeof allowedFormatEntry>;

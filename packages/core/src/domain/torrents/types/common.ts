import type { z } from "zod";
import type { qualityType, sourceType } from "@canto/validators";

export type Quality = z.infer<typeof qualityType>;
export type Source = z.infer<typeof sourceType>;

export interface ConfidenceContext {
  hasDigitalRelease: boolean;
}

import { z } from "zod";

export const profileSectionKey = z.enum([
  // Overview blocks
  "year_in_progress",
  "recent_completions",
  "currently_watching",
  "top_favorites",
  "watchlist_launchpad",
  "recent_activity",
  // Stats narrative blocks
  "stats_dashboard",
  "taste_map",
  "insights",
]);
export type ProfileSectionKey = z.infer<typeof profileSectionKey>;

export const profileSectionConfig = z.object({
  widgets: z.array(z.string()).optional(),
}).default({});
export type ProfileSectionConfigInput = z.infer<typeof profileSectionConfig>;

export const profileSectionInput = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().min(0).max(24),
  sectionKey: profileSectionKey,
  title: z.string().min(1).max(200),
  config: profileSectionConfig,
  enabled: z.boolean().default(true),
});
export type ProfileSectionInput = z.infer<typeof profileSectionInput>;

export const saveProfileSectionsInput = z.object({
  sections: z.array(profileSectionInput).max(25),
});
export type SaveProfileSectionsInput = z.infer<typeof saveProfileSectionsInput>;

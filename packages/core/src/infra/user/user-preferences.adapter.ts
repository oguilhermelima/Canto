import { eq, isNotNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { user } from "@canto/db/schema";

import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";

export function makeUserPreferences(db: Database): UserPreferencesPort {
  return {
    findUserLanguage: async (userId) => {
      const row = await db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { language: true },
      });
      return row?.language ?? null;
    },
    findUserWatchPreferences: async (userId) => {
      const row = await db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { language: true, watchRegion: true },
      });
      if (!row) return null;
      return {
        language: row.language,
        watchRegion: row.watchRegion,
      };
    },
    listActiveUserLanguages: async () => {
      const rows = await db
        .selectDistinct({ language: user.language })
        .from(user)
        .where(isNotNull(user.language));
      return rows.map((r) => r.language).filter((l) => l.length > 0);
    },
  };
}

import type { Database } from "@canto/db/client";
import * as schema from "@canto/db/schema";
import { DEFAULT_HOME_SECTIONS } from "@canto/db/home-section-defaults";
import { DEFAULT_PROFILE_SECTIONS } from "@canto/db/profile-section-defaults";

export async function onboardNewUser(
  db: Database,
  userId: string,
  _email: string,
): Promise<void> {
  await db.insert(schema.list).values({
    userId,
    name: "Watchlist",
    slug: "watchlist",
    type: "watchlist",
    isSystem: true,
  });

  await db.insert(schema.homeSection).values(
    DEFAULT_HOME_SECTIONS.map((s) => ({ ...s, userId })),
  );

  await db.insert(schema.profileSection).values(
    DEFAULT_PROFILE_SECTIONS.map((s) => ({ ...s, userId })),
  );
}

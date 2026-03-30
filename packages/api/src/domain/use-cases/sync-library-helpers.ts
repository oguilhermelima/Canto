import { eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";

export async function autoElectDefaults(db: Database): Promise<void> {
  for (const t of ["movies", "shows", "animes"]) {
    const ofType = await db.query.library.findMany({
      where: eq(library.type, t),
    });
    if (ofType.length > 0 && !ofType.some((l) => l.isDefault)) {
      const first = ofType.find((l) => l.enabled) ?? ofType[0];
      if (first) {
        await db
          .update(library)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(library.id, first.id));
      }
    }
  }
}

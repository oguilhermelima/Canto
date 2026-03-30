import type { Database } from "@canto/db/client";
import {
  findLibrariesByType,
  updateLibrary,
} from "../../infrastructure/repositories";

export async function autoElectDefaults(db: Database): Promise<void> {
  for (const t of ["movies", "shows", "animes"]) {
    const ofType = await findLibrariesByType(db, t);
    if (ofType.length > 0 && !ofType.some((l) => l.isDefault)) {
      const first = ofType.find((l) => l.enabled) ?? ofType[0];
      if (first) {
        await updateLibrary(db, first.id, { isDefault: true });
      }
    }
  }
}

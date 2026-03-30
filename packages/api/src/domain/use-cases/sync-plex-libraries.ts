import { eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";

import { autoElectDefaults } from "./sync-library-helpers";

interface PlexSection {
  key: string;
  title: string;
  type: string;
  Location: Array<{ path: string }>;
}

async function plexFetch<T>(
  url: string,
  token: string,
  endpoint: string,
): Promise<T> {
  const res = await fetch(`${url}${endpoint}`, {
    headers: {
      Accept: "application/json",
      "X-Plex-Token": token,
    },
  });

  if (!res.ok) {
    throw new Error(`Plex ${endpoint} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function syncPlexLibraries(
  db: Database,
  url: string,
  token: string,
): Promise<Array<{ id: string; name: string; action: "created" | "updated" }>> {
  const data = await plexFetch<{
    MediaContainer: { Directory: PlexSection[] };
  }>(url, token, "/library/sections");

  const sections = data.MediaContainer.Directory ?? [];
  const synced: Array<{ id: string; name: string; action: "created" | "updated" }> = [];

  for (const section of sections) {
    if (!["movie", "show"].includes(section.type)) continue;

    let type = "movies";
    if (section.type === "show") {
      type = /anime/i.test(section.title) ? "animes" : "shows";
    }

    let existing = await db.query.library.findFirst({
      where: eq(library.plexLibraryId, section.key),
    });

    if (!existing) {
      const allOfType = await db.query.library.findMany({
        where: eq(library.type, type),
      });
      existing = allOfType.find((l) => !l.plexLibraryId) ?? undefined;
    }

    if (existing) {
      await db
        .update(library)
        .set({
          plexLibraryId: section.key,
          updatedAt: new Date(),
        })
        .where(eq(library.id, existing.id));
      synced.push({ id: existing.id, name: section.title, action: "updated" });
    } else {
      const [row] = await db
        .insert(library)
        .values({
          name: section.title,
          type,
          mediaPath: section.Location[0]?.path ?? null,
          containerMediaPath: section.Location[0]?.path ?? null,
          qbitCategory: type === "movies" ? "movies" : type === "animes" ? "animes" : "shows",
          plexLibraryId: section.key,
          isDefault: false,
          enabled: true,
        })
        .returning();
      if (row) {
        synced.push({ id: row.id, name: section.title, action: "created" });
      }
    }
  }

  await autoElectDefaults(db);
  return synced;
}

import { db } from "@canto/db/client";
import { media } from "@canto/db/schema";
import { eq, and } from "drizzle-orm";
import { getSupportedLanguageCodes, updateMediaFromNormalized } from "@canto/db/persist-media";
import { TmdbProvider } from "@canto/providers";
import { getSetting } from "@canto/db/settings";

async function main() {
  const externalId = parseInt(process.argv[2] ?? "0", 10);
  if (!externalId) {
    console.error("Usage: tsx scripts/refresh-media.ts <tmdb-id>");
    process.exit(1);
  }

  const apiKey = (await getSetting("tmdb.apiKey")) as string;
  const language = ((await getSetting("general.language")) as string) ?? "en-US";
  console.log("Language setting:", language);

  const tmdb = new TmdbProvider(apiKey, language);
  const supportedLangs = [...(await getSupportedLanguageCodes(db))];
  console.log("Supported langs:", supportedLangs);

  const row = await db.query.media.findFirst({
    where: and(eq(media.externalId, externalId), eq(media.provider, "tmdb")),
  });

  if (!row) {
    console.log(`Media not found in DB for externalId=${externalId}`);
    process.exit(0);
  }

  console.log("Found media:", row.id, row.title, "type:", row.type);
  console.log("Current posterPath:", row.posterPath);
  console.log("Current logoPath:", row.logoPath);

  const normalized = await tmdb.getMetadata(externalId, row.type as "movie" | "show", {
    supportedLanguages: supportedLangs,
  });
  console.log("TMDB posterPath:", normalized.posterPath);
  console.log("TMDB logoPath:", normalized.logoPath);

  if (normalized.translations) {
    for (const t of normalized.translations) {
      if (t.language.startsWith("pt")) {
        console.log(`Translation ${t.language} -> poster: ${t.posterPath}, logo: ${t.logoPath}, title: ${t.title}`);
      }
    }
  }

  await updateMediaFromNormalized(db, row.id, normalized);
  console.log("Updated media record.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

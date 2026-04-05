import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually to avoid dotenv dependency
const envPath = resolve(import.meta.dirname, "../../.env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env may not exist */ }

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url);

async function run() {
  // Check if already migrated
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('download_folder', 'library')
  `;

  const hasLibrary = tables.some((t) => t.table_name === "library");
  const hasDownloadFolder = tables.some((t) => t.table_name === "download_folder");

  if (hasDownloadFolder) {
    console.log("download_folder table already exists — migration already applied.");

    // Check if folder_server_link exists
    const linkTables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'folder_server_link'
    `;
    if (linkTables.length === 0) {
      console.log("Creating folder_server_link table...");
      await sql`
        CREATE TABLE "folder_server_link" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "folder_id" uuid NOT NULL REFERENCES "download_folder"("id") ON DELETE CASCADE,
          "server_type" varchar(20) NOT NULL,
          "server_library_id" varchar(100) NOT NULL,
          "server_library_name" varchar(200),
          "server_path" varchar(500),
          "sync_enabled" boolean NOT NULL DEFAULT false,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `;
      await sql`
        CREATE UNIQUE INDEX "uq_folder_server_link"
        ON "folder_server_link" ("folder_id", "server_type", "server_library_id")
      `;
      console.log("folder_server_link created.");
    }
    await sql.end();
    return;
  }

  if (!hasLibrary) {
    console.log("No library table found — creating download_folder from scratch...");
    await sql`
      CREATE TABLE "download_folder" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(100) NOT NULL,
        "download_path" varchar(500),
        "library_path" varchar(500),
        "qbit_category" varchar(100),
        "rules" jsonb,
        "priority" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;
    await sql`
      CREATE TABLE "folder_server_link" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "folder_id" uuid NOT NULL REFERENCES "download_folder"("id") ON DELETE CASCADE,
        "server_type" varchar(20) NOT NULL,
        "server_library_id" varchar(100) NOT NULL,
        "server_library_name" varchar(200),
        "server_path" varchar(500),
        "sync_enabled" boolean NOT NULL DEFAULT false,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;
    await sql`
      CREATE UNIQUE INDEX "uq_folder_server_link"
      ON "folder_server_link" ("folder_id", "server_type", "server_library_id")
    `;
    console.log("Created download_folder + folder_server_link from scratch.");
    await sql.end();
    return;
  }

  // Migrate library → download_folder
  console.log("Migrating library → download_folder...");

  // 1. Rename table
  await sql`ALTER TABLE "library" RENAME TO "download_folder"`;
  console.log("  Renamed table.");

  // 2. Add new columns
  await sql`ALTER TABLE "download_folder" ADD COLUMN IF NOT EXISTS "download_path" varchar(500)`;
  await sql`ALTER TABLE "download_folder" ADD COLUMN IF NOT EXISTS "library_path" varchar(500)`;
  await sql`ALTER TABLE "download_folder" ADD COLUMN IF NOT EXISTS "rules" jsonb`;
  await sql`ALTER TABLE "download_folder" ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0`;
  console.log("  Added new columns.");

  // 3. Migrate data
  const hasMediaPath = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'download_folder' AND column_name = 'media_path'
  `;
  if (hasMediaPath.length > 0) {
    await sql`UPDATE "download_folder" SET "library_path" = "media_path" WHERE "media_path" IS NOT NULL`;
    console.log("  Copied media_path → library_path.");
  }

  // 4. Generate rules from type
  const hasType = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'download_folder' AND column_name = 'type'
  `;
  if (hasType.length > 0) {
    await sql`UPDATE "download_folder" SET "rules" = '{"operator":"AND","conditions":[{"field":"type","op":"eq","value":"movie"}]}'::jsonb, "priority" = 20 WHERE "type" = 'movies'`;
    await sql`UPDATE "download_folder" SET "rules" = '{"operator":"AND","conditions":[{"field":"type","op":"eq","value":"show"}]}'::jsonb, "priority" = 10 WHERE "type" = 'shows'`;
    await sql`UPDATE "download_folder" SET "rules" = '{"operator":"AND","conditions":[{"field":"type","op":"eq","value":"show"},{"operator":"OR","conditions":[{"field":"originCountry","op":"contains_any","value":["JP"]},{"field":"genre","op":"contains_any","value":["Animation"]}]}]}'::jsonb, "priority" = 0 WHERE "type" = 'animes'`;
    console.log("  Generated rules from type column.");
  }

  // 5. Drop old columns
  for (const col of ["type", "media_path", "container_media_path", "jellyfin_library_id", "jellyfin_path", "plex_library_id", "sync_enabled"]) {
    await sql.unsafe(`ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "${col}" CASCADE`);
  }
  console.log("  Dropped old columns.");

  // 6. Update FK references
  await sql`ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_library_id_library_id_fk"`;
  await sql`ALTER TABLE "media" ADD CONSTRAINT "media_library_id_download_folder_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."download_folder"("id") ON DELETE set null ON UPDATE no action`;
  await sql`ALTER TABLE "sync_item" DROP CONSTRAINT IF EXISTS "sync_item_library_id_library_id_fk"`;
  await sql`ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_library_id_download_folder_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."download_folder"("id") ON DELETE cascade ON UPDATE no action`;
  console.log("  Updated FK references.");

  // 7. Create folder_server_link
  await sql`
    CREATE TABLE "folder_server_link" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "folder_id" uuid NOT NULL REFERENCES "download_folder"("id") ON DELETE CASCADE,
      "server_type" varchar(20) NOT NULL,
      "server_library_id" varchar(100) NOT NULL,
      "server_library_name" varchar(200),
      "server_path" varchar(500),
      "sync_enabled" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE UNIQUE INDEX "uq_folder_server_link"
    ON "folder_server_link" ("folder_id", "server_type", "server_library_id")
  `;
  console.log("  Created folder_server_link table.");

  console.log("Migration complete!");
  await sql.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

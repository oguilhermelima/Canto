/**
 * One-off: convert any user.image / user.header_image stored as a base64 data
 * URI into a file under UPLOADS_DIR, then update the row to a /api/files URL.
 *
 * Background: storing raw base64 in user fields blew up the better-auth
 * cookieCache payload past Chromium's response/request header caps and broke
 * sign-in (ERR_RESPONSE_HEADERS_TOO_BIG / 431).
 *
 * Run with: pnpm -F @canto/web exec tsx scripts/migrate-base64-images.ts
 */
import { eq, like, or, sql } from "drizzle-orm";
import { db } from "@canto/db/client";
import { user } from "@canto/db/schema";
import { processAndStoreImage, type ImageVariant } from "../src/lib/uploads";

async function migrateField(
  userId: string,
  column: "image" | "headerImage",
  variant: ImageVariant,
  value: string,
): Promise<void> {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!match) {
    console.warn(`  ${column}: not a base64 data URI, skipping`);
    return;
  }
  const buffer = Buffer.from(match[2]!, "base64");
  const { url } = await processAndStoreImage(variant, userId, buffer);
  await db.update(user).set({ [column]: url }).where(eq(user.id, userId));
  console.log(`  ${column}: ${(buffer.length / 1024).toFixed(1)}KB → ${url}`);
}

async function run(): Promise<void> {
  const rows = await db
    .select({ id: user.id, image: user.image, headerImage: user.headerImage })
    .from(user)
    .where(or(like(user.image, "data:%"), like(user.headerImage, "data:%")));

  if (rows.length === 0) {
    console.log("No users with base64 images. Nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} user(s) with base64 image fields\n`);

  for (const row of rows) {
    console.log(`User ${row.id}`);
    if (row.image?.startsWith("data:")) {
      await migrateField(row.id, "image", "avatar", row.image);
    }
    if (row.headerImage?.startsWith("data:")) {
      await migrateField(row.id, "headerImage", "header", row.headerImage);
    }
  }

  console.log("\nDone.");
  await db.execute(sql`SELECT 1`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));

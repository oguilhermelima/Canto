import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "data", "uploads");

export const PUBLIC_UPLOADS_PREFIX = "/api/files";

export type ImageVariant = "avatar" | "header";

const VARIANTS: Record<ImageVariant, { width: number; height: number; maxBytes: number }> = {
  avatar: { width: 256, height: 256, maxBytes: 2 * 1024 * 1024 },
  header: { width: 1500, height: 500, maxBytes: 4 * 1024 * 1024 },
};

export function getMaxBytes(variant: ImageVariant): number {
  return VARIANTS[variant].maxBytes;
}

export async function processAndStoreImage(
  variant: ImageVariant,
  userId: string,
  input: ArrayBuffer | Buffer,
): Promise<{ url: string; absolutePath: string }> {
  const { width, height } = VARIANTS[variant];
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const webp = await sharp(buffer)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();

  const hash = createHash("sha256").update(webp).digest("hex").slice(0, 16);
  const filename = `${variant}-${hash}.webp`;
  const userDir = path.join(UPLOADS_DIR, "u", userId);
  const absolutePath = path.join(userDir, filename);

  await mkdir(userDir, { recursive: true });
  await writeFile(absolutePath, webp);

  return {
    url: `${PUBLIC_UPLOADS_PREFIX}/u/${userId}/${filename}`,
    absolutePath,
  };
}

export function resolveUploadPath(relative: string): string | null {
  const normalized = path.posix.normalize(relative).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("/../")) return null;
  return path.join(UPLOADS_DIR, normalized);
}

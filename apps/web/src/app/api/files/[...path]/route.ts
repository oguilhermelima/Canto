import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolveUploadPath } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-static";

const MIME_BY_EXT: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await ctx.params;
  const relative = segments.join("/");

  const absolute = resolveUploadPath(relative);
  if (!absolute) return new NextResponse(null, { status: 400 });

  let size: number;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return new NextResponse(null, { status: 404 });
    size = info.size;
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const ext = absolute.slice(absolute.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

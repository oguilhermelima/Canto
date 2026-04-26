import { NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";
import { auth } from "@canto/auth";
import {
  getMaxBytes,
  processAndStoreImage,
  type ImageVariant,
} from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS: ReadonlySet<ImageVariant> = new Set(["avatar", "header"]);
const isSecure = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

interface CachedSession {
  session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string };
  user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date };
  updatedAt: number;
  version?: string;
}

function isImageVariant(value: string): value is ImageVariant {
  return (VALID_KINDS as ReadonlySet<string>).has(value);
}

async function getUserId(req: Request): Promise<string | null> {
  const cached = await getCookieCache<CachedSession>(req, { isSecure });
  if (cached) return cached.user.id;
  const fresh = await auth.api.getSession({ headers: req.headers });
  return fresh?.user.id ?? null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await ctx.params;
  if (!isImageVariant(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "not an image" }, { status: 400 });
  }
  if (file.size > getMaxBytes(kind)) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const { url } = await processAndStoreImage(kind, userId, buffer);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "failed to process image" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@canto/auth";
import {
  getMaxBytes,
  processAndStoreImage,
  type ImageVariant,
} from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS: ReadonlySet<ImageVariant> = new Set(["avatar", "header"]);

function isImageVariant(value: string): value is ImageVariant {
  return (VALID_KINDS as ReadonlySet<string>).has(value);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await ctx.params;
  if (!isImageVariant(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
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
    const { url } = await processAndStoreImage(kind, session.user.id, buffer);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "failed to process image" }, { status: 500 });
  }
}

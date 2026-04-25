export type UploadKind = "avatar" | "header";

export async function uploadImage(kind: UploadKind, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`/api/upload/${kind}`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "upload failed");
  }

  const json = (await res.json()) as { url: string };
  return json.url;
}

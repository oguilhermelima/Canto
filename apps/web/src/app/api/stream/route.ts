import { NextRequest, NextResponse } from "next/server";
import WebTorrent from "webtorrent";
import type { Torrent, TorrentFile } from "webtorrent";

/* -------------------------------------------------------------------------- */
/*  Singleton WebTorrent client (Node.js — connects to all peers via TCP/UDP) */
/* -------------------------------------------------------------------------- */

let client: WebTorrent.Instance | null = null;

function getClient(): WebTorrent.Instance {
  if (!client) {
    client = new WebTorrent();
    client.on("error", (err) => {
      console.error("[stream] WebTorrent error:", err);
    });
  }
  return client;
}

/* Track active torrents to avoid re-adding */
const activeTorrents = new Map<string, Torrent>();

function addOrGetTorrent(magnet: string): Promise<Torrent> {
  // Extract info hash for dedup
  const hashMatch = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnet);
  const hash = hashMatch?.[1]?.toLowerCase();

  if (hash && activeTorrents.has(hash)) {
    return Promise.resolve(activeTorrents.get(hash)!);
  }

  const wt = getClient();

  // Check if already added
  const existing = wt.torrents.find((t) => t.infoHash === hash);
  if (existing) {
    if (hash) activeTorrents.set(hash, existing);
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const torrent = wt.add(magnet, { destroyStoreOnDestroy: true });

    const timeout = setTimeout(() => {
      reject(new Error("Torrent metadata timeout (30s)"));
    }, 30000);

    torrent.on("ready", () => {
      clearTimeout(timeout);
      if (hash) activeTorrents.set(hash, torrent);
      // Prioritize sequential download for streaming
      torrent.files.forEach((f) => f.deselect());
      resolve(torrent);
    });

    torrent.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function findVideoFile(torrent: Torrent): TorrentFile | null {
  const videoExts = [".mp4", ".mkv", ".avi", ".webm", ".mov", ".m4v", ".ts"];
  const sorted = [...torrent.files].sort((a, b) => b.length - a.length);
  return sorted.find((f) => videoExts.some((ext) => f.name.toLowerCase().endsWith(ext))) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  GET /api/stream?magnet=...                                                */
/*  Supports HTTP Range requests for seeking                                  */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest): Promise<NextResponse | Response> {
  const magnet = req.nextUrl.searchParams.get("magnet");
  if (!magnet) {
    return NextResponse.json({ error: "magnet parameter required" }, { status: 400 });
  }

  let torrent: Torrent;
  try {
    torrent = await addOrGetTorrent(magnet);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load torrent" },
      { status: 502 },
    );
  }

  const file = findVideoFile(torrent);
  if (!file) {
    return NextResponse.json({ error: "No video file in torrent" }, { status: 404 });
  }

  // Select this file for download
  file.select();

  const range = req.headers.get("range");
  const fileSize = file.length;

  // Determine MIME type
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    m4v: "video/mp4",
    ts: "video/mp2t",
  };
  const contentType = mimeMap[ext ?? ""] ?? "video/mp4";

  if (range) {
    // Partial content (Range request for seeking)
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0]!, 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 5 * 1024 * 1024, fileSize - 1); // 5MB chunks
    const chunkSize = end - start + 1;

    const stream = file.createReadStream({ start, end });

    return new Response(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream as any,
      {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
        },
      },
    );
  }

  // Full file (no range)
  const stream = file.createReadStream();

  return new Response(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream as any,
    {
      status: 200,
      headers: {
        "Content-Length": String(fileSize),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  DELETE /api/stream?hash=...  — cleanup a preview torrent                  */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const hash = req.nextUrl.searchParams.get("hash");
  if (!hash) return NextResponse.json({ ok: true });

  const torrent = activeTorrents.get(hash.toLowerCase());
  if (torrent) {
    torrent.destroy();
    activeTorrents.delete(hash.toLowerCase());
  }

  return NextResponse.json({ ok: true });
}

import { XMLParser } from "fast-xml-parser";
import type { IndexerResult } from "../../../domain/types/torrent";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Extract text content from a parsed XML value.
 * fast-xml-parser with ignoreAttributes:false returns objects like
 * { "#text": "value", "@_attr": "..." } for elements with attributes.
 * This helper normalizes to a plain string.
 */
function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"] ?? "");
  }
  return String(value);
}

/**
 * Parse Torznab/Newznab XML into IndexerResult[].
 * Shared between Prowlarr (newznab endpoint) and Jackett (torznab endpoint).
 *
 * Extracts torznab attributes including:
 * - seeders, peers, magneturl, size
 * - downloadvolumefactor → freeleech/halfleech/freeleech75/freeleech25
 * - uploadvolumefactor → doubleupload
 */
export function parseTorznabXml(
  xml: string,
  fallbackIndexer = "Unknown",
  indexerLanguage: string | null = null,
): IndexerResult[] {
  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel?.item) return [];

  const items = Array.isArray(channel.item) ? channel.item : [channel.item];
  const results: IndexerResult[] = [];

  for (const raw of items) {
    try {
      const item = raw as Record<string, unknown>;
      const attrs = extractTorznabAttrs(item);
      const seeders = parseInt(attrs.seeders ?? "0", 10);
      const peers = parseInt(attrs.peers ?? "0", 10);
      const pubDate = text(item.pubDate);
      const ageMs = pubDate ? Date.now() - new Date(pubDate).getTime() : 0;

      // Extract flags from torznab attributes
      const flags: string[] = [];
      const dlFactor = parseFloat(attrs.downloadvolumefactor ?? "1");
      if (dlFactor === 0) flags.push("freeleech");
      else if (dlFactor === 0.25) flags.push("freeleech25");
      else if (dlFactor === 0.5) flags.push("halfleech");
      else if (dlFactor === 0.75) flags.push("freeleech75");

      const ulFactor = parseFloat(attrs.uploadvolumefactor ?? "1");
      if (ulFactor >= 2) flags.push("doubleupload");

      // Detect indexer name (Prowlarr/Jackett add their own element)
      const indexerName =
        text(item.prowlarrindexer) ||
        text(item.jackettindexer) ||
        fallbackIndexer;

      const title = text(item.title);
      if (!title) continue;

      const description = text(item.description);

      const sizeStr = text(item.size) || attrs.size || "0";
      const size = parseInt(sizeStr, 10);
      if (isNaN(size)) continue;

      // Download URL from enclosure or link
      const enclosure = item.enclosure as Record<string, unknown> | undefined;
      const downloadUrl =
        text(enclosure?.["@_url"]) ||
        text(item.link) ||
        null;

      const guid = text(item.guid) || text(item.link) || "";

      results.push({
        guid,
        title,
        description: description || null,
        size,
        publishDate: pubDate,
        downloadUrl: downloadUrl || null,
        magnetUrl: attrs.magneturl ?? null,
        infoUrl: text(item.comments) || null,
        indexer: indexerName,
        seeders,
        leechers: Math.max(0, peers - seeders),
        age: Math.floor(ageMs / (1000 * 60 * 60 * 24)),
        indexerFlags: flags,
        indexerLanguage: indexerLanguage,
        categories: parseCategories(item),
      });
    } catch {
      // Skip malformed items
    }
  }

  return results;
}

function extractTorznabAttrs(
  item: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const attrs = (item["torznab:attr"] ?? item["newznab:attr"]) as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | undefined;
  if (!attrs) return result;
  const list = Array.isArray(attrs) ? attrs : [attrs];
  for (const a of list) {
    const rec = a as Record<string, unknown>;
    const name = text(rec["@_name"]);
    const value = text(rec["@_value"]);
    if (name && value) {
      result[name.toLowerCase()] = value;
    }
  }
  return result;
}

function parseCategories(
  item: Record<string, unknown>,
): Array<{ id: number; name: string }> {
  const cats: Array<{ id: number; name: string }> = [];
  const category = item.category;
  if (!category) return cats;
  const list = Array.isArray(category) ? category : [category];
  for (const c of list) {
    // Category can be a plain number, string, or object with #text/@_id
    const obj = c as Record<string, unknown> | string | number;
    let id: number;
    let name: string;
    if (typeof obj === "object" && obj !== null) {
      id = parseInt(text(obj["@_id"]) || text(obj["#text"]), 10);
      name = text(obj["@_name"]) || text(obj["#text"]) || String(id);
    } else {
      id = parseInt(String(obj), 10);
      name = String(obj);
    }
    if (!isNaN(id)) cats.push({ id, name });
  }
  return cats;
}

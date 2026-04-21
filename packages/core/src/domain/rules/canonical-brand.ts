/**
 * Collapse TMDB's storefront variants ("Apple TV+", "Apple TV Store",
 * "Max Amazon Channel") onto a single canonical key so the UI can group them
 * into one brand tile.
 */

const BRAND_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/^apple\s*tv(\s|$|[+])/i, "apple tv"],
  [/^amazon(\s+prime)?\s*(video)?(\s|$)/i, "amazon prime video"],
  [/^prime\s*video(\s|$)/i, "amazon prime video"],
  [/^(hbo\s*)?max(\s|$)/i, "max"],
  [/^hbo(\s|$)/i, "max"],
  [/^disney(\s*\+|\s*plus)(\s|$)/i, "disney+"],
  [/^paramount(\s*\+|\s*plus)(\s|$)/i, "paramount+"],
  [/^peacock(\s|$)/i, "peacock"],
  [/^discovery(\s*\+|\s*plus)(\s|$)/i, "discovery+"],
  [/^amc\+?(\s|$)/i, "amc+"],
  [/^starz(\s|$)/i, "starz"],
  [/^netflix(\s|$)/i, "netflix"],
  [/^google\s+play(\s|$)/i, "google play"],
];

export function canonicalBrand(name: string): string {
  const trimmed = name.trim();
  for (const [pattern, canonical] of BRAND_ALIASES) {
    if (pattern.test(trimmed)) return canonical;
  }
  return trimmed
    .toLowerCase()
    .replace(/\s+amazon\s+channel\b/g, "")
    .replace(/\s+apple\s+tv\s+channel\b/g, "")
    .replace(/\s+\((?:ads|with\s+ads)\)\s*$/g, "")
    .replace(/\s+store\b/g, "")
    .replace(/\s+plus\b/g, "+")
    .replace(/\+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface WatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string;
  displayPriority: number;
}

export type BrandedProvider = WatchProvider & { providerIds: number[] };

export function groupByBrand(providers: WatchProvider[]): BrandedProvider[] {
  const byBrand = new Map<string, { flagship: WatchProvider; ids: Set<number> }>();
  for (const p of providers) {
    const key = canonicalBrand(p.providerName);
    const existing = byBrand.get(key);
    if (!existing) {
      byBrand.set(key, { flagship: p, ids: new Set([p.providerId]) });
    } else {
      existing.ids.add(p.providerId);
      if (p.displayPriority < existing.flagship.displayPriority) {
        existing.flagship = p;
      }
    }
  }

  return Array.from(byBrand.values())
    .sort((a, b) => a.flagship.displayPriority - b.flagship.displayPriority)
    .map(({ flagship, ids }) => ({
      providerId: flagship.providerId,
      providerIds: Array.from(ids).sort((a, b) => a - b),
      providerName: flagship.providerName,
      logoPath: flagship.logoPath,
      displayPriority: flagship.displayPriority,
    }));
}

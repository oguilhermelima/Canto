/**
 * Collapse TMDB's storefront variants ("Apple TV+", "Apple TV Store",
 * "Max Amazon Channel") onto a single canonical key so the UI can group them
 * into one brand tile.
 *
 * Clicking a single brand tile should surface every provider id the user can
 * watch on — subscription + rent/buy + channels — not a single storefront.
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

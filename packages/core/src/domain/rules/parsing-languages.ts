/* ── Language detection ── */

/**
 * Language keywords → ISO code.
 * Includes full names, ISO 639-2/3 codes, and common torrent abbreviations.
 */
const LANGUAGE_MAP: Record<string, string> = {
  // Multi / Dual
  multi: "multi", "multi-vf": "multi", "multi-audio": "multi",
  dual: "dual", "dual.audio": "dual", "dual-audio": "dual",
  // English
  english: "en", eng: "en",
  // Portuguese
  portuguese: "pt", "pt-br": "pt-br", por: "pt", brazilian: "pt-br",
  // French
  french: "fr", fra: "fr", vff: "fr", vostfr: "fr", truefrench: "fr", vfi: "fr",
  // Spanish
  spanish: "es", spa: "es", castellano: "es",
  latino: "es-la", "lat-spa": "es-la", "lat.spa": "es-la",
  // German
  german: "de", ger: "de", deu: "de",
  // Italian
  italian: "it", ita: "it",
  // Japanese
  japanese: "ja", jpn: "ja", jap: "ja",
  // Korean
  korean: "ko", kor: "ko",
  // Chinese
  chinese: "zh", chi: "zh", "zh-cn": "zh", "zh-tw": "zh-tw", mandarin: "zh", cantonese: "zh",
  // Russian
  russian: "ru", rus: "ru",
  // Arabic
  arabic: "ar", ara: "ar",
  // Hindi
  hindi: "hi", hin: "hi",
  // Turkish
  turkish: "tr", tur: "tr",
  // Dutch
  dutch: "nl", dut: "nl",
  // Polish
  polish: "pl", pol: "pl",
  // Swedish
  swedish: "sv", swe: "sv",
  // Norwegian
  norwegian: "no", nor: "no",
  // Danish
  danish: "da", dan: "da",
  // Finnish
  finnish: "fi", fin: "fi",
  // Czech
  czech: "cs", cze: "cs",
  // Hungarian
  hungarian: "hu", hun: "hu",
  // Romanian
  romanian: "ro", rum: "ro",
  // Thai
  thai: "th", tha: "th",
  // Vietnamese
  vietnamese: "vi", vie: "vi",
  // Indonesian
  indonesian: "id", ind: "id",
  // Malay
  malay: "ms", may: "ms",
  // Tamil
  tamil: "ta", tam: "ta",
  // Telugu
  telugu: "te", tel: "te",
};

/**
 * Detect audio/content languages from torrent title.
 * Returns ISO codes. Best-effort — not guaranteed accurate.
 */
export function detectLanguages(title: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  // 1. Standard keyword matching (word boundary)
  for (const [keyword, lang] of Object.entries(LANGUAGE_MAP)) {
    const escaped = keyword.replace(/[.-]/g, "[.\\-]?");
    const pattern = new RegExp(`(?:^|[\\s.\\-_([])${escaped}(?=[\\s.\\-_)\\]]|$)`, "i");
    if (pattern.test(title) && !seen.has(lang)) {
      seen.add(lang);
      found.push(lang);
    }
  }

  // 2. Detect "Multi-Subs" separately (subtitles, not audio)
  if (/multi[.\-_]?subs?/i.test(title) && !seen.has("multi-subs")) {
    found.push("multi-subs");
  }

  return found;
}

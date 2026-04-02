import type { Database } from "./client";
import { supportedLanguage } from "./schema";

const LANGUAGES = [
  { code: "en-US", name: "English", nativeName: "English" },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "pt-PT", name: "Portuguese (Portugal)", nativeName: "Português (Portugal)" },
  { code: "es-ES", name: "Spanish", nativeName: "Español" },
  { code: "fr-FR", name: "French", nativeName: "Français" },
  { code: "de-DE", name: "German", nativeName: "Deutsch" },
  { code: "it-IT", name: "Italian", nativeName: "Italiano" },
  { code: "ja-JP", name: "Japanese", nativeName: "日本語" },
  { code: "ko-KR", name: "Korean", nativeName: "한국어" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "中文（简体）" },
  { code: "ru-RU", name: "Russian", nativeName: "Русский" },
  { code: "ar-SA", name: "Arabic", nativeName: "العربية" },
  { code: "hi-IN", name: "Hindi", nativeName: "हिन्दी" },
  { code: "nl-NL", name: "Dutch", nativeName: "Nederlands" },
  { code: "pl-PL", name: "Polish", nativeName: "Polski" },
  { code: "sv-SE", name: "Swedish", nativeName: "Svenska" },
  { code: "tr-TR", name: "Turkish", nativeName: "Türkçe" },
  { code: "th-TH", name: "Thai", nativeName: "ไทย" },
];

export async function seedLanguages(db: Database): Promise<void> {
  for (const lang of LANGUAGES) {
    await db
      .insert(supportedLanguage)
      .values(lang)
      .onConflictDoNothing();
  }
}

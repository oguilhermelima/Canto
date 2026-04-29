export function fallbackChain(requested: string): readonly string[] {
  return requested === "en-US" ? ["en-US"] : [requested, "en-US"];
}

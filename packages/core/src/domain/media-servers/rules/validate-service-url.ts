import { InvalidServiceUrlError } from "@canto/core/domain/media-servers/errors";

/** Validate that a URL is safe to connect to (HTTP/HTTPS, no metadata endpoints). */
export function validateServiceUrl(url: string): void {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new InvalidServiceUrlError("Only HTTP/HTTPS URLs are allowed");
  }
  const hostname = parsed.hostname.toLowerCase();
  // Block cloud metadata endpoints and link-local — allow private IPs since this is self-hosted
  const blockedPatterns = [
    /^169\.254\./,
    /^0\./,
    /^metadata\.google\.internal$/i,
    /^metadata\.internal$/i,
  ];
  if (blockedPatterns.some((re) => re.test(hostname))) {
    throw new InvalidServiceUrlError("This URL is not allowed");
  }
}

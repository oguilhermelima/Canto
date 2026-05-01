// Re-export so legacy `@canto/core/platform/http/follow-redirects` imports
// keep working. New code should import from
// `@canto/core/domain/shared/services/resolve-download-url`.
export { resolveDownloadUrl } from "@canto/core/domain/shared/services/resolve-download-url";

// Re-export so legacy `@canto/core/platform/concurrency/...` imports keep
// working. New code should import from
// `@canto/core/domain/shared/services/run-with-concurrency`.
export { runWithConcurrency } from "@canto/core/domain/shared/services/run-with-concurrency";

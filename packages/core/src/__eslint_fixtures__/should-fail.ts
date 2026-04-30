/* eslint-disable */
//
// Synthetic ESLint fixture — intentionally violates the domain boundary
// rules declared in packages/core/eslint.config.js. This file is excluded
// from the lint run via the `ignores` glob and from typecheck via the root
// tsconfig, but it is kept in the repo so future contributors can hand-run
// `pnpm -F @canto/core lint -- src/__eslint_fixtures__/should-fail.ts` to
// confirm the boundary rules still bite.
//
// Expected violations when the ignore glob is removed:
//   - `@canto/core/infra/*` import (no-restricted-imports / domain pattern)
//   - `bullmq` import (no-restricted-imports / framework pattern)
//   - `eq` from `drizzle-orm` (no-restricted-imports / runtime helper)
//
// To verify the rules:
//   1. Comment out the `src/__eslint_fixtures__/**` entry in the
//      `ignores` block in packages/core/eslint.config.js.
//   2. Run `pnpm -F @canto/core lint -- src/__eslint_fixtures__/should-fail.ts`.
//   3. ESLint should report the three violations listed above.
//   4. Restore the ignore entry.

// THIS FILE IS NEVER EXECUTED. It exists only to document and verify the
// ESLint boundary rules.

// @ts-nocheck — this file is only a lint fixture; not type-checked.
import { findMediaById } from "@canto/core/infra/media/media-repository";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";

export const _shouldNotBeImported = {
  findMediaById,
  Queue,
  eq,
};

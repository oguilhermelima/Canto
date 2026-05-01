import baseConfig from "@canto/eslint-config/base";

/** @type {import("typescript-eslint").Config} */
export default [
  {
    ignores: [
      "dist/**",
      ".cache/**",
      ".next/**",
      "node_modules/**",
      "eslint.config.js",
      "src/__eslint_fixtures__/**",
    ],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // ----------------------------------------------------------------------
  // Domain boundary lockdown.
  //
  // packages/core/src/domain/** holds the pure-business core of the system.
  // It must NOT reach into infrastructure (DB-shaped repositories, queue
  // dispatchers, HTTP clients, framework-specific shims) directly: anything
  // outside-the-hexagon is brought in via ports declared inside `domain/`
  // and wired up in composition roots (apps/web, apps/worker, packages/api).
  //
  // The patterns below stop the two ways those leaks tend to creep back in:
  //   1. Ambient deep-imports of `@canto/core/infra/*` or
  //      `@canto/core/platform/*` from inside a domain file.
  //   2. Direct usage of infrastructure libraries (drizzle, bullmq, ioredis,
  //      tRPC server, Next, React) — domain code must stay framework-agnostic
  //      so the same use-cases run unchanged from web, mobile, worker, and
  //      the test runner.
  //
  // `drizzle-orm` is allowed only in `import type` form so domain types
  // (e.g. `InferSelectModel`) can still flow through; runtime helpers like
  // `eq` / `and` belong behind a repository.
  // ----------------------------------------------------------------------
  {
    files: ["src/domain/**/*.ts", "src/domain/**/*.tsx"],
    rules: {
      // NOTE: this rule is intentionally `warn` (not `error`) until the
      // ~263 known violations in domain/** are extracted in Wave 10.
      // The fixture in src/__eslint_fixtures__/should-fail.ts proves the
      // rule still fires; keep it that way so we don't lose the lockdown.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: [
                "@canto/core/infra/*",
                "@canto/core/platform/*",
                "../../infra/*",
                "../infra/*",
                "./infra/*",
                "../../platform/*",
                "../platform/*",
                "./platform/*",
              ],
              message:
                "domain/** cannot import infra/* or platform/* directly — use a port via deps.",
            },
            {
              group: [
                "bullmq",
                "ioredis",
                "@trpc/server",
                "next",
                "next/*",
                "react",
                "react-dom",
              ],
              message:
                "domain/** cannot import infrastructure or framework libraries.",
            },
            {
              group: ["drizzle-orm"],
              importNames: [
                "eq",
                "and",
                "or",
                "not",
                "ne",
                "lt",
                "lte",
                "gt",
                "gte",
                "isNull",
                "isNotNull",
                "inArray",
                "notInArray",
                "between",
                "notBetween",
                "like",
                "ilike",
                "notLike",
                "exists",
                "notExists",
                "asc",
                "desc",
                "sql",
                "count",
                "countDistinct",
                "sum",
                "avg",
                "min",
                "max",
              ],
              message:
                "domain/** cannot import drizzle-orm runtime helpers — only `import type` is allowed.",
            },
          ],
        },
      ],
    },
  },
  // ----------------------------------------------------------------------
  // Per-context lockdown (Wave 10 vertical slicing). Each context wave
  // promotes the boundary + latent-error rules from `warn` to `error` once
  // the context has been swept clean. Forcing function: future PRs that
  // regress the contract fail the build.
  // ----------------------------------------------------------------------
  {
    files: ["src/domain/notifications/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/lists/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/recommendations/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
      // NOTE: `no-non-null-assertion` stays at warn for this context — 13
      // existing assertions live in array-iteration helpers
      // (rebuild-user-recs, get-recommendations, get-spotlight) and the
      // engagement-signals tests. Promoting to error would force a wider
      // refactor that doesn't fit in this wave; left as warn so future PRs
      // see the smell without the build collapsing on inherited debt.
    },
  },
  {
    files: ["src/domain/content-enrichment/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/file-organization/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Torrents context — boundary lockdown is `error`. The other rules stay
    // at the default warn level until the parsing-episodes regex helpers and
    // the folder-routing rule narrowing are reworked (the residue is
    // pre-existing pure-rule code, not boundary leaks).
    files: ["src/domain/torrents/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
    },
  },
  {
    files: ["src/domain/trakt/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/media-servers/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/sync/**/*.ts"],
    rules: {
      "no-restricted-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Test fixtures in sync/__tests__ rely on bracket access into known-shape
    // hand-built fixtures; loosening `no-non-null-assertion` here keeps the
    // forcing function on production code without churn in test harnesses.
    files: ["src/domain/sync/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    // Media context — broadest port-first refactor. `eqeqeq` and
    // `no-non-null-assertion` are promoted to `error` so future regressions
    // fail the build. `no-restricted-imports` stays at warn because
    // `persist/tvdb-overlay.ts` still reaches into user-media + torrents
    // tables for the detach/re-attach flow; porting that transactional
    // surface needs cross-context coordination.
    // `prefer-nullish-coalescing` stays at warn because the persist pipeline
    // intentionally treats empty strings as null (`releaseDate || null`),
    // which `??` does not preserve.
    files: ["src/domain/media/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      eqeqeq: ["error", "always"],
    },
  },
];

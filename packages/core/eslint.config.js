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
];

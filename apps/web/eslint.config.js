import nextjsConfig from "@canto/eslint-config/nextjs";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

/** @type {import("typescript-eslint").Config} */
export default [
  {
    ignores: [
      ".next/**",
      ".cache/**",
      "next-env.d.ts",
      "eslint.config.js",
      "next.config.ts",
      "postcss.config.js",
      "scripts/**",
    ],
  },
  ...nextjsConfig,
  {
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Phase 9d lockdown: web inherits the strict baseline from
      // tooling/eslint/base.js (no-unused-vars, no-unnecessary-condition,
      // no-misused-promises, no-explicit-any, consistent-type-imports,
      // import-x/consistent-type-specifier-style, no-floating-promises,
      // prefer-nullish-coalescing, eqeqeq, etc).
      // Local overrides below tighten react-hooks and next-specific rules
      // to `error` so the dashboard never silently regresses.
      "@typescript-eslint/no-explicit-any": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      // react-hooks 7.x compiler-era checks. `set-state-in-effect` is the
      // most aggressive — keep at `warn` until the compiler-safe refactor
      // lands, then promote.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "@next/next/no-img-element": "error",
    },
  },
];

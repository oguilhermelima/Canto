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
      // Soft-fail categories of pre-existing debt: these stay visible as
      // warnings so we know about them but don't block CI on code the lint
      // script never ran against before (web was using the broken
      // `next lint --cache` invocation). Tighten back to "error" as the debt
      // is cleaned up file by file.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-misused-promises": [
        "warn",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "import-x/consistent-type-specifier-style": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "warn",
      // New rules in eslint-plugin-react-hooks 7.x — react-compiler era
      // static-analysis checks that flag patterns the existing codebase
      // relies on (setState in effect, ref access during render, const
      // lexical ordering). Too aggressive to enforce wholesale; keep them
      // visible as warnings and tighten once the compiler-safe refactor
      // lands.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];

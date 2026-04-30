import reactConfig from "@canto/eslint-config/react";
import reactHooks from "eslint-plugin-react-hooks";

/** @type {import("typescript-eslint").Config} */
export default [
  {
    ignores: [
      "dist/**",
      ".cache/**",
      ".next/**",
      "node_modules/**",
      "eslint.config.js",
    ],
  },
  ...reactConfig,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Match apps/web posture: surface debt as warnings, not blockers.
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
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

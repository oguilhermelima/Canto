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
];

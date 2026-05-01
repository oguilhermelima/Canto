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
    rules: {
      // Worker is a backend service whose primary output is operational logs
      // on stdout/stderr. Structured logging via LoggerPort is the goal but
      // refactoring 30+ existing log statements is out of scope here.
      "no-console": "off",
    },
  },
];

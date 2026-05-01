import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import-x";
import turboPlugin from "eslint-config-turbo/flat";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".next/**", ".cache/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...turboPlugin,
  {
    plugins: { "import-x": importPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: true },
      ],
      // Safety rules — promoted to error in Wave Final (F3). These either
      // catch genuine bugs (await missing) or unsafe constructs.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Defaults stay at `warn` — per-package eslint configs promote to
      // `error` for code that has been swept clean. Promotion to global
      // `error` requires a sweep pass across infra/*, platform/*, and the
      // residual deferrals (parsing-episodes regex, sync test fixtures,
      // recommendations array helpers, persist/* releaseDate).
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      eqeqeq: ["warn", "always"],
      "import-x/consistent-type-specifier-style": [
        "error",
        "prefer-top-level",
      ],
    },
  },
);

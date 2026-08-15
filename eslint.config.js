/**
 * ESLint, deliberately small.
 *
 * `tsc` in strict mode already catches most of what a linter would, so this
 * config exists for the things the compiler cannot see: unused expressions,
 * shadowed bindings, `any` creeping into a package whose whole job is types.
 * It is not a style enforcer. There is no formatter in this repo and no rule
 * here fails on whitespace.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/out/**", "**/next-env.d.ts", ".context/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
    },
  },
  {
    // The corpus JSON is data, not source; the fixtures are broken on purpose.
    files: ["**/test/fixtures/**", "**/test/fixtures-broken/**", "**/threads/**"],
    ...tseslint.configs.disableTypeChecked,
  },
);

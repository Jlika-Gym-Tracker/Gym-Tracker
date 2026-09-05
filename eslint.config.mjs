import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-e2e/**",
      "test-results/**",
      "playwright-report/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Vendored design handoff — a reference artefact, not source we maintain.
      "design/**",
      // Generated from the seed migration; regenerate rather than hand-fix.
      "lib/program/__fixtures__/**",
    ],
  },
];

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: ["apps/frontend/"],
      },
    },
  },
  {
    files: ["electron/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "apps/frontend/.next/**",
    "apps/api/dist/**",
    "apps/api/generated/**",
    "dist-desktop/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/frontend/next-env.d.ts",
    "tmp/**",
    ".playwright-cli/**",
  ]),
]);

export default eslintConfig;

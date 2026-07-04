import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "apps/frontend/src"),
      "@ygo/contracts": path.resolve(rootDir, "packages/contracts/src/index.ts"),
      "@ygo/domain": path.resolve(rootDir, "packages/domain/src/index.ts"),
      "server-only": path.resolve(rootDir, "test-support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/api/src/**/*.test.ts",
      "apps/frontend/src/**/*.test.ts",
    ],
  },
});

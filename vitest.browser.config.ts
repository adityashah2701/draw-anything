import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Real-browser checks (system Chrome via playwright-core). Run with `npm run test:browser`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.browser.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

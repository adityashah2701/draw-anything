import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Live AI evaluation (real provider calls, costs money). Run with `npm run eval:ai`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.eval.ts"],
    exclude: ["node_modules/**", ".next/**", ".claude/**"],
    fileParallelism: false,
  },
});

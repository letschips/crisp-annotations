import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "jsdom",
    restoreMocks: true,
  },
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/__mocks__/obsidian.ts", import.meta.url)),
    },
  },
});

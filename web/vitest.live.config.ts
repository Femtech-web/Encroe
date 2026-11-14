import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Runs against NEAR testnet and a local dev server; never part of `npm test`. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 15 * 60_000,
  },
});

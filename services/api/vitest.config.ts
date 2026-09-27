import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});

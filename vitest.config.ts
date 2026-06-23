import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@abot/agents": resolve("packages/agents/src/index.ts"),
      "@abot/context": resolve("packages/context/src/index.ts"),
      "@abot/core": resolve("packages/core/src/index.ts"),
      "@abot/executor": resolve("packages/executor/src/index.ts"),
      "@abot/memory": resolve("packages/memory/src/index.ts"),
      "@abot/router": resolve("packages/router/src/index.ts"),
      "@abot/server": resolve("apps/server/src/server.ts")
    }
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: ["apps/**/*.ts", "packages/**/*.ts"],
      exclude: ["**/*.test.ts", "apps/cli/src/check-*.ts"]
    }
  }
});

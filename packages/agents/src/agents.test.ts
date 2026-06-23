import { describe, expect, it } from "vitest";
import { getAgentConfig, type AgentRegistry } from "./index.js";

describe("getAgentConfig", () => {
  it("returns configured agent records", () => {
    const registry: AgentRegistry = {
      prometheus: {
        model: "opencode-go/glm-5.2",
        tags: ["debugging"]
      }
    };

    expect(getAgentConfig(registry, "prometheus")?.model).toBe("opencode-go/glm-5.2");
    expect(getAgentConfig(registry, "atlas")).toBeUndefined();
  });
});

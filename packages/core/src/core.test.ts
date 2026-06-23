import { describe, expect, it } from "vitest";
import { planFixedAgent, planTask } from "./index.js";

describe("planTask", () => {
  it("returns route, context, and timing details for deterministic tasks", () => {
    const planned = planTask({
      task: "fix the auth regression",
      openFiles: ["src/auth.ts"],
      contextCandidates: [{ path: "src/auth.ts", source: "open" }]
    });

    expect(planned.decision.agent).toBe("prometheus");
    expect(planned.verdict.intent).toBe("debugging");
    expect(planned.context[0].path).toBe("src/auth.ts");
    expect(planned.timings.totalPlanMs).toBeGreaterThanOrEqual(0);
  });

  it("flags context budget warnings", () => {
    const planned = planTask(
      {
        task: "fix auth",
        contextCandidates: [{ path: "src/auth.ts", content: "x".repeat(200), source: "open" }]
      },
      {
        routingOptions: {
          contextBudgets: {
            low: 10,
            medium: 10,
            high: 10,
            ultra: 10
          }
        }
      }
    );

    expect(planned.contextBudgetWarning).toBe(true);
  });
});

describe("planFixedAgent", () => {
  it("bypasses router selection while preserving context estimates", () => {
    const planned = planFixedAgent(
      {
        task: "benchmark this against one model",
        contextCandidates: [{ path: "notes.md", source: "mentioned" }]
      },
      "atlas",
      20
    );

    expect(planned.verdict.phase).toBe("fixed_agent");
    expect(planned.decision.agent).toBe("atlas");
    expect(planned.decision.warnings).toContain("fixed-agent-baseline");
    expect(planned.contextEstimateTokens).toBeGreaterThan(0);
  });
});

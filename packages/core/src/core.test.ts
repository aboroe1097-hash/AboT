import { afterEach, describe, expect, it, vi } from "vitest";
import { planFixedAgent, planTask, planTaskWithFallback } from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("planTaskWithFallback", () => {
  it("keeps router auth failures concise when providers wrap errors in arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              error: {
                code: 401,
                message:
                  "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project."
              }
            }
          ]),
          {
            status: 401,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    const planned = await planTaskWithFallback(
      {
        task: "everything ready?"
      },
      {
        llmRouter: {
          enabled: true,
          provider: "gemini",
          baseUrl: "https://example.test/v1",
          apiKey: "invalid",
          model: "gemini-test"
        }
      }
    );

    expect(planned.decision.warnings).toContain("llm-fallback-failed:401");
    expect(planned.decision.reason).toContain("status 401: invalid authentication credentials");
    expect(planned.decision.reason).not.toContain('"error"');
    expect(planned.decision.reason).not.toContain("developers.google.com");
  });
});

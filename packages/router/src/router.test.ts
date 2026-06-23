import { describe, expect, it } from "vitest";
import { classifySignals, resolveAgent, type RouterVerdict } from "./index.js";

describe("classifySignals", () => {
  it("routes CSS work to visual engineering deterministically", () => {
    const verdict = classifySignals({
      task: "polish the responsive CSS layout",
      openFiles: ["apps/web/public/styles.css"]
    });

    expect(verdict.phase).toBe("deterministic");
    expect(verdict.intent).toBe("css_design");
    expect(verdict.suggestedAgent).toBe("visual-engineering");
    expect(verdict.signals).toContain("files:css");
  });

  it("prioritizes debugging over review when regression signals are strong", () => {
    const verdict = classifySignals({
      task: "review the failing auth tests and find the regression",
      openFiles: ["src/auth.test.ts"]
    });

    expect(verdict.intent).toBe("debugging");
    expect(verdict.suggestedAgent).toBe("prometheus");
  });

  it("marks vague tasks for LLM fallback", () => {
    const verdict = classifySignals({ task: "do the thing we discussed" });

    expect(verdict.phase).toBe("llm_fallback_needed");
    expect(verdict.intent).toBe("code_impl");
  });
});

describe("resolveAgent", () => {
  it("uses strong fallback for ambiguous deterministic results", () => {
    const verdict = classifySignals({ task: "do the thing we discussed" });
    const decision = resolveAgent(verdict);

    expect(decision.agent).toBe("unspecified-high");
    expect(decision.warnings).toContain("llm-fallback-needed");
  });

  it("downgrades guarded expensive agents when confidence or complexity is insufficient", () => {
    const verdict: RouterVerdict = {
      phase: "deterministic",
      intent: "code_impl",
      complexity: "medium",
      scope: "execution",
      confidence: 0.8,
      deterministicScore: 0.8,
      suggestedAgent: "sisyphus",
      candidateAgents: ["sisyphus"],
      intentScores: { code_impl: 0.8 },
      secondaryIntents: [],
      multiIntent: false,
      signals: [],
      reason: "test"
    };

    const decision = resolveAgent(verdict);

    expect(decision.agent).toBe("hephaestus");
    expect(decision.warnings).toContain("guarded-agent-downgraded:sisyphus");
  });
});

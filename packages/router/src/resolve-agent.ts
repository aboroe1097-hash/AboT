import type { AgentName, Complexity, RouteDecision, RouterVerdict, RoutingOptions } from "./types.js";

const DEFAULT_CONTEXT_BUDGETS: Record<Complexity, number> = {
  low: 2000,
  medium: 6000,
  high: 16000,
  ultra: 32000
};

const GUARDED_AGENTS = new Set<AgentName>(["sisyphus", "momus", "ultrabrain"]);

export const AGENT_COST_UNITS: Partial<Record<AgentName, number>> = {
  explore: 1,
  quick: 1,
  librarian: 1,
  writing: 1,
  "sisyphus-junior": 3,
  atlas: 3,
  prometheus: 3,
  "multimodal-looker": 7,
  hephaestus: 7,
  "visual-engineering": 12,
  metis: 12,
  oracle: 12,
  sisyphus: 20,
  momus: 35,
  ultrabrain: 35,
  "unspecified-low": 1,
  "unspecified-high": 12
};

export function resolveAgent(verdict: RouterVerdict, options: RoutingOptions = {}): RouteDecision {
  const minConfidence = options.minConfidence ?? 0.7;
  const expensiveAgentConfidence = options.expensiveAgentConfidence ?? 0.85;
  const budgets = options.contextBudgets ?? DEFAULT_CONTEXT_BUDGETS;
  const warnings: string[] = [];

  if (verdict.phase === "llm_fallback_needed") {
    return {
      phase: verdict.phase,
      agent: "unspecified-high",
      contextBudgetTokens: budgets.high,
      confidence: verdict.confidence,
      costUnits: AGENT_COST_UNITS["unspecified-high"] ?? 12,
      reason: "Deterministic signals are ambiguous; LLM fallback is not wired yet, so using strong general fallback",
      warnings: ["llm-fallback-needed"]
    };
  }

  if (verdict.phase !== "llm_fallback" && verdict.confidence < minConfidence) {
    return {
      phase: verdict.phase,
      agent: "unspecified-high",
      contextBudgetTokens: budgets.high,
      confidence: verdict.confidence,
      costUnits: AGENT_COST_UNITS["unspecified-high"] ?? 12,
      reason: `Confidence ${verdict.confidence} is below ${minConfidence}; using strong general fallback`,
      warnings: ["low-confidence-route"]
    };
  }

  let agent = verdict.suggestedAgent;

  if (GUARDED_AGENTS.has(agent)) {
    const canUseGuardedAgent =
      verdict.confidence >= expensiveAgentConfidence &&
      (verdict.complexity === "high" || verdict.complexity === "ultra");

    if (!canUseGuardedAgent) {
      warnings.push(`guarded-agent-downgraded:${agent}`);
      agent = downgradeGuardedAgent(agent, verdict.complexity);
    }
  }

  const costUnits = AGENT_COST_UNITS[agent] ?? 12;
  if (options.sessionBudgetRemaining !== undefined && costUnits > options.sessionBudgetRemaining) {
    warnings.push(`session-budget-downgraded:${agent}`);
    agent = downgradeForBudget(agent);
  }

  return {
    phase: verdict.phase,
    agent,
    contextBudgetTokens: budgets[verdict.complexity],
    confidence: verdict.confidence,
    costUnits: AGENT_COST_UNITS[agent] ?? costUnits,
    reason: buildDecisionReason(verdict, agent, warnings),
    warnings
  };
}

export function getAgentCostUnits(agent: AgentName): number {
  return AGENT_COST_UNITS[agent] ?? 12;
}

function downgradeGuardedAgent(agent: AgentName, complexity: Complexity): AgentName {
  if (agent === "momus") return complexity === "low" ? "atlas" : "hephaestus";
  if (agent === "sisyphus") return complexity === "medium" || complexity === "high" ? "hephaestus" : "atlas";
  return "unspecified-high";
}

function downgradeForBudget(agent: AgentName): AgentName {
  if (agent === "sisyphus") return "hephaestus";
  if (agent === "momus") return "atlas";
  if (agent === "ultrabrain") return "oracle";
  if (agent === "visual-engineering" || agent === "metis" || agent === "oracle") return "librarian";
  return "unspecified-low";
}

function buildDecisionReason(verdict: RouterVerdict, agent: AgentName, warnings: string[]): string {
  const base = `${verdict.intent}/${verdict.complexity} resolved to ${agent}`;
  return warnings.length > 0 ? `${base}; warnings=${warnings.join(",")}` : base;
}

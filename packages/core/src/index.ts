import { performance } from "node:perf_hooks";
import { estimateContextTokens, scoreContextCandidates, type ContextCandidate } from "@abot/context";
import {
  classifySignals,
  getAgentCostUnits,
  resolveAgent,
  type AgentName,
  type RouteDecision,
  type RouterInput,
  type RouterVerdict
} from "@abot/router";
import { classifyWithLlmFallback, getEnvLlmRouterOptions, type LlmRouterOptions } from "./llm-router.js";

export interface PlanTaskInput extends RouterInput {
  contextCandidates?: ContextCandidate[];
}

export interface PlanTaskOptions {
  routingOptions?: Parameters<typeof resolveAgent>[1];
  llmRouter?: LlmRouterOptions;
}

export interface PlannedTask {
  verdict: RouterVerdict;
  decision: RouteDecision;
  context: ReturnType<typeof scoreContextCandidates>;
  contextEstimateTokens: number;
  contextBudgetWarning: boolean;
  llmFallbackUsed: boolean;
  timings: Record<string, number>;
}

export function planTask(input: PlanTaskInput, options: PlanTaskOptions = {}): PlannedTask {
  const totalStart = performance.now();
  const classifyStart = performance.now();
  const verdict = classifySignals(input);
  const classifyMs = elapsed(classifyStart);
  const contextStart = performance.now();
  const context = scoreContextCandidates(input.task, input.contextCandidates ?? []);
  const contextEstimateTokens = estimateContextTokens(input.contextCandidates ?? []);
  const contextMs = elapsed(contextStart);
  const resolveStart = performance.now();
  const decision = resolveAgent(verdict, options.routingOptions);
  const resolveMs = elapsed(resolveStart);

  return {
    verdict,
    decision,
    context,
    contextEstimateTokens,
    contextBudgetWarning: contextEstimateTokens > decision.contextBudgetTokens,
    llmFallbackUsed: false,
    timings: {
      classifyMs,
      llmFallbackMs: 0,
      contextMs,
      resolveMs,
      totalPlanMs: elapsed(totalStart)
    }
  };
}

export async function planTaskWithFallback(input: PlanTaskInput, options: PlanTaskOptions = {}): Promise<PlannedTask> {
  const totalStart = performance.now();
  const classifyStart = performance.now();
  const initial = classifySignals(input);
  const classifyMs = elapsed(classifyStart);
  let verdict = initial;
  let llmFallbackUsed = false;
  let llmFallbackMs = 0;

  if (initial.phase === "llm_fallback_needed") {
    const llmStart = performance.now();
    const llmChoice = await classifyWithLlmFallback(input, initial, options.llmRouter ?? getEnvLlmRouterOptions());
    llmFallbackMs = elapsed(llmStart);

    if (llmChoice) {
      llmFallbackUsed = true;
      verdict = {
        ...initial,
        phase: "llm_fallback",
        suggestedAgent: llmChoice.agent,
        candidateAgents: [...new Set([...initial.candidateAgents, llmChoice.agent])],
        signals: [...initial.signals, "llm:fallback"],
        reason: `llm_fallback: ${llmChoice.reasoning}`
      };
    }
  }

  const contextStart = performance.now();
  const context = scoreContextCandidates(input.task, input.contextCandidates ?? []);
  const contextEstimateTokens = estimateContextTokens(input.contextCandidates ?? []);
  const contextMs = elapsed(contextStart);
  const resolveStart = performance.now();
  const decision = resolveAgent(verdict, options.routingOptions);
  const resolveMs = elapsed(resolveStart);

  return {
    verdict,
    decision,
    context,
    contextEstimateTokens,
    contextBudgetWarning: contextEstimateTokens > decision.contextBudgetTokens,
    llmFallbackUsed,
    timings: {
      classifyMs,
      llmFallbackMs,
      contextMs,
      resolveMs,
      totalPlanMs: elapsed(totalStart)
    }
  };
}

export function planFixedAgent(input: PlanTaskInput, fixedAgent: AgentName, contextBudgetTokens = 32000): PlannedTask {
  const totalStart = performance.now();
  const contextStart = performance.now();
  const context = scoreContextCandidates(input.task, input.contextCandidates ?? []);
  const contextEstimateTokens = estimateContextTokens(input.contextCandidates ?? []);
  const contextMs = elapsed(contextStart);
  const verdict: RouterVerdict = {
    phase: "fixed_agent",
    intent: "code_impl",
    complexity: "medium",
    scope: "execution",
    confidence: 1,
    deterministicScore: 1,
    suggestedAgent: fixedAgent,
    candidateAgents: [fixedAgent],
    intentScores: {},
    secondaryIntents: [],
    multiIntent: false,
    signals: ["mode:fixed-agent", "router:bypassed"],
    reason: `Fixed-agent baseline forced ${fixedAgent}; router selection bypassed`
  };
  const decision: RouteDecision = {
    phase: "fixed_agent",
    agent: fixedAgent,
    contextBudgetTokens,
    confidence: 1,
    costUnits: getAgentCostUnits(fixedAgent),
    reason: `Fixed-agent baseline forced ${fixedAgent}`,
    warnings: ["fixed-agent-baseline"]
  };

  return {
    verdict,
    decision,
    context,
    contextEstimateTokens,
    contextBudgetWarning: contextEstimateTokens > contextBudgetTokens,
    llmFallbackUsed: false,
    timings: {
      classifyMs: 0,
      llmFallbackMs: 0,
      contextMs,
      resolveMs: 0,
      totalPlanMs: elapsed(totalStart)
    }
  };
}

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

export * from "./llm-router.js";

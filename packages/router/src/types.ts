export const AGENT_NAMES = [
  "visual-engineering",
  "ultrabrain",
  "deep",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "sisyphus",
  "hephaestus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "prometheus",
  "metis",
  "momus",
  "atlas",
  "sisyphus-junior"
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export type RouterIntent =
  | "css_design"
  | "code_impl"
  | "qa_review"
  | "planning"
  | "research"
  | "debugging"
  | "multimodal"
  | "writing";

export type Complexity = "low" | "medium" | "high" | "ultra";

export type TaskScope = "execution" | "review" | "planning";

export type RouterPhase = "deterministic" | "llm_fallback_needed" | "llm_fallback" | "fixed_agent";

export interface RouterInput {
  task: string;
  openFiles?: string[];
  changedFiles?: string[];
  diffLines?: number;
  memoryHints?: string[];
}

export interface RouterVerdict {
  phase: RouterPhase;
  intent: RouterIntent;
  complexity: Complexity;
  scope: TaskScope;
  confidence: number;
  deterministicScore: number;
  suggestedAgent: AgentName;
  candidateAgents: AgentName[];
  intentScores: Partial<Record<RouterIntent, number>>;
  secondaryIntents: RouterIntent[];
  multiIntent: boolean;
  signals: string[];
  reason: string;
}

export interface RoutingOptions {
  minConfidence?: number;
  phase1Threshold?: number;
  expensiveAgentConfidence?: number;
  sessionBudgetRemaining?: number;
  contextBudgets?: Record<Complexity, number>;
}

export interface RouteDecision {
  phase: RouterPhase;
  agent: AgentName;
  contextBudgetTokens: number;
  confidence: number;
  costUnits: number;
  reason: string;
  warnings: string[];
}

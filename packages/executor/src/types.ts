import type { ScoredContextCandidate } from "@abot/context";
import type { AgentName } from "@abot/router";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AgentModelCandidate {
  model: string;
  variant?: string;
  source: "primary" | "fallback";
  index: number;
}

export interface AgentExecutionRequest {
  agent: AgentName;
  messages: ChatMessage[];
  contextBudgetTokens: number;
  contextFiles: ScoredContextCandidate[];
  configPath?: string;
  maxFallbackAttempts?: number;
  timeoutMs?: number;
}

export interface ExecutionRequest extends AgentExecutionRequest {
  model: string;
  variant?: string;
}

export interface AgentModelAttempt {
  model: string;
  variant?: string;
  provider?: string;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

export interface ExecutionResult {
  agent: AgentName;
  model: string;
  variant?: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  content: string;
  finishReason: string;
  attemptedModels: AgentModelAttempt[];
  rawUsage?: unknown;
}

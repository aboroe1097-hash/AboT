export interface MemoryItem {
  id: string;
  projectId: string;
  kind: "decision" | "file-change" | "preference" | "pattern" | "failed-approach";
  summary: string;
  tags: string[];
  confidence: number;
}

export interface MemorySearchInput {
  projectId: string;
  task: string;
  limit?: number;
}

export interface MemoryStore {
  search(input: MemorySearchInput): Promise<MemoryItem[]>;
  append(item: Omit<MemoryItem, "id">): Promise<MemoryItem>;
}

export interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  sessionBudgetUnits: number;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RouteEventInput {
  projectId: string;
  task: string;
  mode: "orchestrated" | "fixed_agent";
  fixedAgent?: string;
  openFiles: string[];
  changedFiles: string[];
  diffLines: number;
  verdict: unknown;
  decision: {
    agent: string;
    phase: string;
    costUnits: number;
    contextBudgetTokens: number;
    confidence?: number;
    reason?: string;
    warnings: string[];
  };
  context: unknown;
  contextEstimateTokens: number;
  contextBudgetWarning: boolean;
  taskEstimateTokens: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  timings: Record<string, number>;
  metrics: Record<string, unknown>;
}

export interface RouteEventRecord extends RouteEventInput {
  id: string;
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  projectId: string;
  routeEventId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export { SqliteAboTStore } from "./sqlite-store.js";

import type { AgentName } from "@abot/router";

export interface AgentConfig {
  model: string;
  tags: string[];
  provider?: string;
}

export type AgentRegistry = Partial<Record<AgentName, AgentConfig>>;

export function getAgentConfig(registry: AgentRegistry, agent: AgentName): AgentConfig | undefined {
  return registry[agent];
}


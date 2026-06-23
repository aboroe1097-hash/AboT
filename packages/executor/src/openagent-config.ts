import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentName } from "@abot/router";
import type { AgentModelCandidate } from "./types.js";

interface OpenAgentModelEntry {
  model?: string;
  variant?: string;
  fallback_models?: Array<{
    model?: string;
    variant?: string;
  }>;
}

interface OpenAgentConfig {
  agents?: Record<string, OpenAgentModelEntry>;
  categories?: Record<string, OpenAgentModelEntry>;
}

export function getOpenAgentConfigPath(): string {
  return process.env.ABOT_OPENAGENT_CONFIG ?? join(homedir(), ".config", "opencode", "oh-my-openagent.json");
}

export function getAgentModelCandidates(agent: AgentName, configPath = getOpenAgentConfigPath()): AgentModelCandidate[] {
  const config = readOpenAgentConfig(configPath);
  const entry = config.agents?.[agent] ?? config.categories?.[agent];
  if (!entry?.model) return [];

  const candidates: AgentModelCandidate[] = [
    {
      model: entry.model,
      variant: entry.variant,
      source: "primary",
      index: 0
    }
  ];

  for (const [index, fallback] of (entry.fallback_models ?? []).entries()) {
    if (!fallback.model) continue;
    candidates.push({
      model: fallback.model,
      variant: fallback.variant,
      source: "fallback",
      index: index + 1
    });
  }

  return candidates;
}

function readOpenAgentConfig(configPath: string): OpenAgentConfig {
  if (!existsSync(configPath)) {
    throw new Error(`OpenAgent config not found: ${configPath}`);
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  return parsed && typeof parsed === "object" ? (parsed as OpenAgentConfig) : {};
}

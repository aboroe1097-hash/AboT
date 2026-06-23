import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getEnvLlmRouterOptions } from "@abot/core";
import { getOpenAgentConfigPath } from "@abot/executor";

export interface ApiToolConfig {
  id: string;
  label: string;
  kind: string;
  enabled: boolean;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  modelEnv?: string;
}

export interface ApiToolsFile {
  tools: ApiToolConfig[];
}

export interface ApiToolStatus extends ApiToolConfig {
  configured: boolean;
  missingEnv: string[];
}

export function getToolsPath(): string {
  return resolve("data/api-tools.json");
}

export function readApiTools(filePath = getToolsPath()): ApiToolsFile {
  ensureToolsFile(filePath);
  return normalize(JSON.parse(readFileSync(filePath, "utf8")) as ApiToolsFile);
}

export function writeApiTools(config: ApiToolsFile, filePath = getToolsPath()): ApiToolsFile {
  mkdirSync(dirname(filePath), { recursive: true });
  const normalized = normalize(config);
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function getApiToolStatuses(config = readApiTools()): ApiToolStatus[] {
  return config.tools.map((tool) => {
    if (tool.id === "router-llm") {
      const router = getEnvLlmRouterOptions();
      return {
        ...tool,
        kind: router.provider === "gemini" ? "gemini-openai-compatible-chat" : tool.kind,
        configured: Boolean(router.enabled),
        missingEnv: getRouterMissingEnv()
      };
    }

    if (tool.id === "execution") {
      const missingEnv = getExecutionMissingEnv();
      return {
        ...tool,
        kind: "openai-compatible-executor",
        configured: missingEnv.length === 0,
        missingEnv
      };
    }

    const envNames = [tool.baseUrlEnv, tool.apiKeyEnv, tool.modelEnv].filter(Boolean) as string[];
    const missingEnv = envNames.filter((name) => !process.env[name]);
    return {
      ...tool,
      configured: missingEnv.length === 0,
      missingEnv
    };
  });
}

function getExecutionMissingEnv(): string[] {
  const missing: string[] = [];
  if (process.env.ABOT_EXECUTION_ADAPTER === "codex-cli") return missing;

  const modelOverride = process.env.ABOT_EXECUTION_MODEL?.trim();

  if (!modelOverride && !existsSync(getOpenAgentConfigPath())) missing.push("ABOT_OPENAGENT_CONFIG");

  const requiredKey = getRequiredExecutionEnv(modelOverride);
  if (requiredKey) {
    if (!process.env[requiredKey]) missing.push(requiredKey);
    return missing;
  }

  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.OPENCODE_GO_BASE_URL) {
    missing.push("OPENAI_API_KEY or GEMINI_API_KEY or OPENROUTER_API_KEY or OPENCODE_GO_BASE_URL");
  }
  return missing;
}

function getRequiredExecutionEnv(modelOverride: string | undefined): string | undefined {
  if (!modelOverride) return undefined;
  const provider = modelOverride.includes("/") ? modelOverride.split("/")[0] : "openai";

  switch (provider) {
    case "google":
    case "gemini":
      return "GEMINI_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "opencode-go":
      return process.env.OPENCODE_GO_BASE_URL ? undefined : "OPENCODE_GO_BASE_URL";
    default:
      return undefined;
  }
}

function getRouterMissingEnv(): string[] {
  const router = getEnvLlmRouterOptions();
  if (router.enabled) return [];
  if (router.provider === "gemini") {
    return process.env.ABOT_ROUTER_API_KEY || process.env.GEMINI_API_KEY
      ? []
      : ["GEMINI_API_KEY or ABOT_ROUTER_API_KEY"];
  }
  return ["ABOT_ROUTER_BASE_URL", "ABOT_ROUTER_API_KEY", "ABOT_ROUTER_MODEL"].filter((name) => !process.env[name]);
}

function ensureToolsFile(filePath: string): void {
  if (existsSync(filePath)) return;
  mkdirSync(dirname(filePath), { recursive: true });
  copyFileSync(resolve("configs/api-tools.example.json"), filePath);
}

function normalize(config: ApiToolsFile): ApiToolsFile {
  return {
    tools: Array.isArray(config.tools)
      ? config.tools.map((tool) => ({
          id: String(tool.id),
          label: String(tool.label),
          kind: String(tool.kind),
          enabled: Boolean(tool.enabled),
          baseUrlEnv: normalizeEnvName(tool.baseUrlEnv, "baseUrlEnv"),
          apiKeyEnv: normalizeEnvName(tool.apiKeyEnv, "apiKeyEnv"),
          modelEnv: normalizeEnvName(tool.modelEnv, "modelEnv")
        }))
      : []
  };
}

function normalizeEnvName(value: unknown, fieldName: string): string | undefined {
  if (!value) return undefined;
  const envName = String(value).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
    throw new Error(`${fieldName} must be an environment variable name, not a secret value`);
  }
  return envName;
}

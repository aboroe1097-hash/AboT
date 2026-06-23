import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
    const envNames = [tool.baseUrlEnv, tool.apiKeyEnv, tool.modelEnv].filter(Boolean) as string[];
    const missingEnv = envNames.filter((name) => !process.env[name]);
    return {
      ...tool,
      configured: missingEnv.length === 0,
      missingEnv
    };
  });
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

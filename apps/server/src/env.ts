import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function loadLocalEnv(paths = [".env.local", ".env"]): void {
  for (const path of paths) {
    const filePath = resolve(path);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      process.env[key] ??= unquote(rawValue.trim());
    }
  }
}

export function writeLocalEnvValues(values: Record<string, string | undefined>, filePath = ".env.local"): string[] {
  const absolutePath = resolve(filePath);
  const updates = Object.entries(values)
    .map(([key, value]) => [key, value?.trim()] as const)
    .filter(([key, value]) => isEnvName(key) && Boolean(value));

  if (updates.length === 0) return [];

  const updateMap = new Map(updates);
  const lines = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8").split(/\r?\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;

    const key = match[1];
    const value = updateMap.get(key);
    if (!value) return line;

    seen.add(key);
    return `${key}=${quoteEnvValue(value)}`;
  });

  for (const [key, value] of updateMap.entries()) {
    if (!seen.has(key) && value) {
      nextLines.push(`${key}=${quoteEnvValue(value)}`);
    }
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${trimTrailingBlankLines(nextLines).join("\n")}\n`, "utf8");

  for (const [key, value] of updateMap.entries()) {
    if (value) process.env[key] = value;
  }

  return [...updateMap.keys()];
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function quoteEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:\\-]+$/.test(value) ? value : JSON.stringify(value);
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1]?.trim() === "") next.pop();
  return next;
}

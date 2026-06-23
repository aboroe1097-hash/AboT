import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { resolveProviderModel, type ProviderConfig } from "./provider-registry.js";
import { DEFAULT_EXECUTION_TIMEOUT_MS, elapsed, MAX_CONTEXT_FILES, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from "@abot/utils";
import { getAgentModelCandidates } from "./openagent-config.js";
import type {
  AgentExecutionRequest,
  AgentModelAttempt,
  AgentModelCandidate,
  ChatMessage,
  ExecutionRequest,
  ExecutionResult
} from "./types.js";

export class ExecutionError extends Error {
  constructor(
    message: string,
    readonly details: {
      provider?: string;
      model?: string;
      statusCode?: number;
      attempts?: AgentModelAttempt[];
    } = {}
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

export async function executeAgentTask(request: AgentExecutionRequest): Promise<ExecutionResult> {
  if (process.env.ABOT_EXECUTION_ADAPTER === "codex-cli") {
    return executeCodexCliTask(request);
  }

  if (process.env.ABOT_EXECUTION_ADAPTER === "auto") {
    return executeAutoTask(request);
  }

  const candidates = getExecutionCandidates(request);
  return executeApiCandidates(request, candidates);
}

async function executeAutoTask(request: AgentExecutionRequest): Promise<ExecutionResult> {
  const apiCandidates = getAutoApiCandidates();
  const preferApi = shouldPreferApiExecution(request.agent);
  const attempts: AgentModelAttempt[] = [];

  if (preferApi && apiCandidates.length > 0) {
    try {
      return await executeApiCandidates(request, apiCandidates, attempts);
    } catch (error) {
      attempts.push(...readAttempts(error));
    }
  }

  try {
    const codex = await executeCodexCliTask(request);
    return {
      ...codex,
      attemptedModels: [...attempts, ...codex.attemptedModels]
    };
  } catch (error) {
    attempts.push(...readAttempts(error));
    if (!preferApi && apiCandidates.length > 0) {
      return await executeApiCandidates(request, apiCandidates, attempts);
    }
    throw new ExecutionError("All auto execution models failed", { attempts });
  }
}

async function executeApiCandidates(
  request: AgentExecutionRequest,
  candidates: AgentModelCandidate[],
  priorAttempts: AgentModelAttempt[] = []
): Promise<ExecutionResult> {
  if (candidates.length === 0) {
    throw new ExecutionError(`No model configured for agent ${request.agent}`);
  }

  const attempts: AgentModelAttempt[] = [...priorAttempts];
  const maxAttempts = Math.max(1, Math.min(request.maxFallbackAttempts ?? candidates.length, candidates.length));

  for (const candidate of candidates.slice(0, maxAttempts)) {
    try {
      const result = await executeTask({
        ...request,
        model: candidate.model,
        variant: candidate.variant
      });
      return {
        ...result,
        attemptedModels: [...attempts, ...result.attemptedModels]
      };
    } catch (error) {
      const attempt = toAttempt(candidate, error);
      attempts.push(attempt);
      if (!shouldTryFallback(attempt.statusCode)) break;
    }
  }

  throw new ExecutionError("All execution models failed", { attempts });
}

export async function executeCodexCliTask(request: AgentExecutionRequest): Promise<ExecutionResult> {
  const started = performance.now();
  const model = getCodexModel();
  const sandbox = process.env.ABOT_CODEX_SANDBOX?.trim() || "workspace-write";
  const tempDir = mkdtempSync(join(tmpdir(), "abot-codex-"));
  const outputPath = join(tempDir, "last-message.txt");
  const env = { ...process.env };

  if (process.env.ABOT_CODEX_USE_OPENAI_API_KEY !== "true") {
    delete env.OPENAI_API_KEY;
  }

  try {
    await runCodexProcess(
      process.env.ABOT_CODEX_COMMAND?.trim() || "codex",
      [
        "exec",
        "--sandbox",
        sandbox,
        "--model",
        model,
        "-C",
        request.cwd || process.cwd(),
        "-o",
        outputPath,
        "-"
      ],
      {
        cwd: request.cwd || process.cwd(),
        env,
        timeoutMs: Math.max(MIN_TIMEOUT_MS, Math.min(request.timeoutMs ?? MAX_TIMEOUT_MS, MAX_TIMEOUT_MS)),
        input: buildCodexPrompt(request)
      }
    );
    const latencyMs = elapsed(started);
    const content = readFileSync(outputPath, "utf8").trim();

    return {
      agent: request.agent,
      model: `codex/${model}`,
      provider: "codex-cli",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      content: content || "(Codex returned an empty final message.)",
      finishReason: "stop",
      attemptedModels: [
        {
          model: `codex/${model}`,
          provider: "codex-cli",
          ok: true,
          latencyMs
        }
      ]
    };
  } catch (error) {
    const err = error as { code?: number | string; stderr?: string; stdout?: string; message?: string };
    throw new ExecutionError(summarizeCodexError(err), {
      provider: "codex-cli",
      model: `codex/${model}`,
      statusCode: typeof err.code === "number" ? err.code : undefined,
      attempts: [
        {
          model: `codex/${model}`,
          provider: "codex-cli",
          ok: false,
          statusCode: typeof err.code === "number" ? err.code : undefined,
          error: summarizeCodexError(err)
        }
      ]
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runCodexProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; input: string }
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject({
          code,
          stdout,
          stderr,
          message: timedOut ? "Codex CLI timed out" : `Codex CLI exited with code ${code}`
        });
      }
    });
    child.stdin.end(options.input);
  });
}

function getCodexModel(): string {
  const configured = process.env.ABOT_CODEX_MODEL?.trim() || process.env.ABOT_EXECUTION_MODEL?.trim();
  if (!configured) return "gpt-5.5";
  const slashIndex = configured.indexOf("/");
  return slashIndex === -1 ? configured : configured.slice(slashIndex + 1);
}

function buildCodexPrompt(request: AgentExecutionRequest): string {
  return [
    `AboT selected agent: ${request.agent}.`,
    "Execute this task in the local workspace. Inspect and edit files when the task requires it.",
    "Keep the final response concise and include what changed plus any checks run.",
    "",
    ...request.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
  ].join("\n");
}

function summarizeCodexError(error: { stderr?: string; stdout?: string; message?: string }): string {
  const text = [error.stderr, error.stdout, error.message].filter(Boolean).join("\n").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(-8).join("\n") || "Codex CLI execution failed";
}

function getExecutionCandidates(request: AgentExecutionRequest): AgentModelCandidate[] {
  const overrideModel = process.env.ABOT_EXECUTION_MODEL?.trim();
  if (overrideModel) {
    return [
      {
        model: overrideModel,
        variant: process.env.ABOT_EXECUTION_VARIANT?.trim() || undefined,
        source: "primary",
        index: 0
      }
    ];
  }

  return getAgentModelCandidates(request.agent, request.configPath);
}

function getAutoApiCandidates(): AgentModelCandidate[] {
  const configured = process.env.ABOT_EXECUTION_FALLBACK_MODEL?.trim();
  const routerModel = process.env.ABOT_ROUTER_MODEL?.trim();
  const model = configured || (routerModel ? `google/${routerModel}` : undefined);
  if (!model) return [];

  return [
    {
      model,
      variant: process.env.ABOT_EXECUTION_FALLBACK_VARIANT?.trim() || undefined,
      source: "fallback",
      index: 0
    }
  ];
}

function shouldPreferApiExecution(agent: string): boolean {
  return new Set([
    "quick",
    "unspecified-low",
    "writing",
    "librarian",
    "oracle",
    "momus"
  ]).has(agent);
}

function readAttempts(error: unknown): AgentModelAttempt[] {
  return error instanceof ExecutionError && error.details.attempts?.length ? error.details.attempts : [];
}

export async function executeTask(request: ExecutionRequest): Promise<ExecutionResult> {
  const resolved = resolveProviderModel(request.model);
  const started = performance.now();
  const apiKey = resolved.provider.apiKeyEnv ? process.env[resolved.provider.apiKeyEnv] : undefined;

  if (!resolved.provider.baseUrl) {
    throw new ExecutionError(`Missing base URL for provider ${resolved.provider.id}`, {
      provider: resolved.provider.id,
      model: request.model
    });
  }

  if (resolved.provider.requiresApiKey && !apiKey) {
    throw new ExecutionError(`Missing env: ${resolved.provider.apiKeyEnv}`, {
      provider: resolved.provider.id,
      model: request.model
    });
  }

  const body = {
    model: resolved.modelId,
    messages: buildMessages(request),
    stream: false,
    ...resolved.provider.variantToBody?.(request.variant)
  };

  const controller = new AbortController();
  const timeout = windowedTimeout(controller, request.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolved.provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: buildHeaders(resolved.provider, apiKey),
      body: JSON.stringify(body)
    });
    const latencyMs = elapsed(started);
    const json = await readJson(response);

    if (!response.ok) {
      throw new ExecutionError(summarizeProviderError(json, response.status), {
        provider: resolved.provider.id,
        model: request.model,
        statusCode: response.status
      });
    }

    const usage = readUsage(json);
    const content = readContent(json);
    const finishReason = readFinishReason(json);
    return {
      agent: request.agent,
      model: request.model,
      variant: request.variant,
      provider: resolved.provider.id,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      content,
      finishReason,
      attemptedModels: [
        {
          model: request.model,
          variant: request.variant,
          provider: resolved.provider.id,
          ok: true,
          statusCode: response.status,
          latencyMs
        }
      ],
      rawUsage: usage.raw
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildMessages(request: ExecutionRequest): ChatMessage[] {
  const contextFiles = request.contextFiles.slice(0, MAX_CONTEXT_FILES);
  if (contextFiles.length === 0) return request.messages;

  return [
    {
      role: "system",
      content: [
        "AboT selected these context files for this task.",
        "Use them as routing context only; file contents are not included in this execution call.",
        ...contextFiles.map((file) => `- ${file.path} (${file.reasons.join(", ") || "context"})`)
      ].join("\n")
    },
    ...request.messages
  ];
}

function buildHeaders(provider: ProviderConfig, apiKey: string | undefined): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    ...provider.defaultHeaders
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

function readUsage(json: unknown): { inputTokens: number; outputTokens: number; raw: unknown } {
  const usage = getRecord(json).usage;
  const record = getRecord(usage);
  return {
    inputTokens: numberField(record.prompt_tokens) ?? numberField(record.input_tokens) ?? 0,
    outputTokens: numberField(record.completion_tokens) ?? numberField(record.output_tokens) ?? 0,
    raw: usage
  };
}

function readContent(json: unknown): string {
  const choices = getRecord(json).choices;
  if (!Array.isArray(choices)) return "";
  const first = getRecord(choices[0]);
  const message = getRecord(first.message);
  return typeof message.content === "string" ? message.content : "";
}

function readFinishReason(json: unknown): string {
  const choices = getRecord(json).choices;
  if (!Array.isArray(choices)) return "unknown";
  const first = getRecord(choices[0]);
  return typeof first.finish_reason === "string" ? first.finish_reason : "unknown";
}

function summarizeProviderError(json: unknown, statusCode: number): string {
  const error = getRecord(getRecord(json).error);
  if (typeof error.message === "string") return `Provider returned ${statusCode}: ${error.message}`;
  return `Provider returned ${statusCode}`;
}

function toAttempt(candidate: AgentModelCandidate, error: unknown): AgentModelAttempt {
  if (error instanceof ExecutionError) {
    return {
      model: candidate.model,
      variant: candidate.variant,
      provider: error.details.provider,
      ok: false,
      statusCode: error.details.statusCode,
      error: error.message
    };
  }

  return {
    model: candidate.model,
    variant: candidate.variant,
    ok: false,
    error: error instanceof Error ? error.message : "Unknown execution error"
  };
}

function shouldTryFallback(statusCode: number | undefined): boolean {
  return statusCode === undefined || [400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 529].includes(statusCode);
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function windowedTimeout(controller: AbortController, timeoutMs: number): NodeJS.Timeout {
  return setTimeout(() => controller.abort(), Math.max(MIN_TIMEOUT_MS, Math.min(timeoutMs, MAX_TIMEOUT_MS)));
}


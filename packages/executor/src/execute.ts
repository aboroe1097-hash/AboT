import { performance } from "node:perf_hooks";
import { resolveProviderModel, type ProviderConfig } from "./provider-registry.js";
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
  const candidates = getAgentModelCandidates(request.agent, request.configPath);
  if (candidates.length === 0) {
    throw new ExecutionError(`No model configured for agent ${request.agent}`);
  }

  const attempts: AgentModelAttempt[] = [];
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
  const timeout = windowedTimeout(controller, request.timeoutMs ?? 120000);

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
  const contextFiles = request.contextFiles.slice(0, 20);
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
    return JSON.parse(text) as unknown;
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
  return statusCode === undefined || [400, 429, 503, 529].includes(statusCode);
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function windowedTimeout(controller: AbortController, timeoutMs: number): NodeJS.Timeout {
  return setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs, 300000)));
}

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

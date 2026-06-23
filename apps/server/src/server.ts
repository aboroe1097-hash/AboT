import { exec } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  classifyWithLlmFallback,
  formatLlmRouterFailure,
  GEMINI_OPENAI_COMPAT_BASE_URL,
  getEnvLlmRouterOptions,
  planFixedAgent,
  planTaskWithFallback,
  type LlmRouterDiagnostics,
  type PlannedTask
} from "@abot/core";
import { estimateTokenCount } from "@abot/context";
import { executeAgentTask, executeTask, ExecutionError, getOpenAgentConfigPath } from "@abot/executor";
import { SqliteAboTStore, type ProjectRecord, type RouteEventRecord } from "@abot/memory";
import { AGENT_NAMES, getAgentCostUnits, type AgentName, type RouterVerdict } from "@abot/router";
import { writeLocalEnvValues } from "./env.js";
import { getApiToolStatuses, readApiTools, writeApiTools, type ApiToolsFile } from "./tool-config.js";

const execAsync = promisify(exec);

export interface AboTServerOptions {
  dbPath?: string;
  webRoot?: string;
  defaultProjectRoot?: string;
  store?: SqliteAboTStore;
}

export interface RouteRequest {
  task: string;
  mode?: "orchestrated" | "fixed_agent";
  fixedAgent?: AgentName;
  projectId?: string;
  projectName?: string;
  rootPath?: string;
  openFiles?: string[];
  changedFiles?: string[];
  diffLines?: number;
  execute?: boolean;
  executionTimeoutMs?: number;
}

export interface RouteResponse {
  project: ProjectRecord;
  route: RouteEventRecord;
  planned: PlannedTask;
  budgetRemaining: number;
}

export interface ApiSetupRequest {
  routerProvider?: "gemini" | "openai-compatible";
  routerModel?: string;
  routerBaseUrl?: string;
  routerApiKey?: string;
  openAgentConfig?: string;
  executionProvider?: "auto" | "codex-cli" | "gemini" | "openai" | "openrouter" | "opencode-go";
  executionModel?: string;
  executionApiKey?: string;
  opencodeGoBaseUrl?: string;
}

export function createAboTServer(options: AboTServerOptions = {}): Server {
  const store = options.store ?? new SqliteAboTStore(options.dbPath ?? resolve("data/abot.sqlite"));
  const webRoot = options.webRoot ?? resolve("apps/web/public");
  const defaultProjectRoot = options.defaultProjectRoot ?? process.env.ABOT_DEFAULT_PROJECT_ROOT ?? process.cwd();

  const server = createServer(async (request, response) => {
    try {
      await handleRequest({ request, response, store, webRoot, defaultProjectRoot });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown server error"
      });
    }
  });

  server.on("close", () => {
    if (!options.store) store.close();
  });

  return server;
}

async function handleRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  store: SqliteAboTStore;
  webRoot: string;
  defaultProjectRoot: string;
}): Promise<void> {
  const { request, response, store, webRoot, defaultProjectRoot } = input;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/api/health") {
    const routerLlm = getEnvLlmRouterOptions();
    sendJson(response, 200, {
      ok: true,
      version: "0.0.1",
      routerLlmConfigured: Boolean(routerLlm.enabled),
      routerProvider: routerLlm.provider,
      routerModel: routerLlm.model
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/projects") {
    const projects = store.listProjects();
    if (projects.length === 0) {
      projects.push(store.ensureProject({ rootPath: defaultProjectRoot, name: "AboT" }));
    }
    sendJson(response, 200, { projects });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson<{ name?: string; rootPath?: string; sessionBudgetUnits?: number }>(request);
    const project = store.ensureProject({
      name: body.name,
      rootPath: body.rootPath || defaultProjectRoot,
      sessionBudgetUnits: body.sessionBudgetUnits
    });
    sendJson(response, 200, { project });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/route") {
    const body = await readJson<RouteRequest>(request);
    const result = await routeAndLog(store, body, defaultProjectRoot);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/routes") {
    sendJson(response, 200, {
      routes: store.listRoutes({
        projectId: url.searchParams.get("projectId") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 50)
      })
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export/routes") {
    const routes = store.exportRoutes({
      projectId: url.searchParams.get("projectId") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 1000)
    });
    const format = url.searchParams.get("format") ?? "json";

    if (format === "csv") {
      sendText(response, 200, routesToCsv(routes), "text/csv; charset=utf-8");
    } else {
      sendJson(response, 200, {
        exportedAt: new Date().toISOString(),
        count: routes.length,
        routes
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJson<RouteRequest>(request);
    const result = await routeAndLog(store, body, defaultProjectRoot);
    const userMessage = store.addChatMessage({
      projectId: result.project.id,
      routeEventId: result.route.id,
      role: "user",
      content: body.task
    });
    const execution = body.execute
      ? await executeAndLog(store, result, Number(body.executionTimeoutMs ?? 120000))
      : {
          status: "dry-run",
          content: buildDryRunAssistantMessage(result),
          note: "Execution is off. Enable execute=true to call the selected model."
        };
    const assistantMessage = store.addChatMessage({
      projectId: result.project.id,
      routeEventId: result.route.id,
      role: "assistant",
      content: execution.content
    });

    sendJson(response, 200, {
      ...result,
      messages: [userMessage, assistantMessage],
      execution
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/chat") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      sendJson(response, 400, { error: "projectId is required" });
      return;
    }
    sendJson(response, 200, {
      messages: store.listChatMessages({
        projectId,
        limit: Number(url.searchParams.get("limit") ?? 100)
      })
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tools") {
    sendJson(response, 200, {
      config: readApiTools(),
      tools: getApiToolStatuses()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/setup") {
    sendJson(response, 200, getSetupStatus());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/setup") {
    const body = await readJson<ApiSetupRequest>(request);
    const writtenKeys = writeLocalEnvValues(buildSetupEnvUpdates(body));
    sendJson(response, 200, {
      ok: true,
      writtenKeys,
      setup: getSetupStatus()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/setup/confirm") {
    const routerProbe = await probeRouterModel();
    const executionProbe = await probeExecutionModel();
    sendJson(response, 200, {
      ok: true,
      setup: {
        ...getSetupStatus(),
        routerProbe,
        executionProbe
      }
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workspace/tree") {
    const project = getProjectOrThrow(store, url.searchParams.get("projectId"), defaultProjectRoot);
    const target = resolveProjectPath(project.rootPath, url.searchParams.get("path") ?? ".");
    const entries = listWorkspaceEntries(project.rootPath, target);
    sendJson(response, 200, {
      project,
      path: toProjectRelative(project.rootPath, target),
      entries
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workspace/file") {
    const project = getProjectOrThrow(store, url.searchParams.get("projectId"), defaultProjectRoot);
    const target = resolveProjectPath(project.rootPath, url.searchParams.get("path") ?? "");
    if (!statSync(target).isFile()) {
      sendJson(response, 400, { error: "Path is not a file" });
      return;
    }
    sendJson(response, 200, {
      project,
      path: toProjectRelative(project.rootPath, target),
      content: readFileSync(target, "utf8")
    });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/workspace/file") {
    const body = await readJson<{ projectId?: string; path?: string; content?: string }>(request);
    const project = getProjectOrThrow(store, body.projectId, defaultProjectRoot);
    if (!body.path?.trim()) {
      sendJson(response, 400, { error: "path is required" });
      return;
    }
    const target = resolveProjectPath(project.rootPath, body.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body.content ?? "", "utf8");
    sendJson(response, 200, {
      ok: true,
      project,
      path: toProjectRelative(project.rootPath, target),
      bytes: Buffer.byteLength(body.content ?? "", "utf8")
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/workspace/command") {
    const body = await readJson<{ projectId?: string; command?: string; cwd?: string; timeoutMs?: number }>(request);
    const project = getProjectOrThrow(store, body.projectId, defaultProjectRoot);
    if (!body.command?.trim()) {
      sendJson(response, 400, { error: "command is required" });
      return;
    }
    const cwd = resolveProjectPath(project.rootPath, body.cwd ?? ".");
    const started = performance.now();
    const result = await runWorkspaceCommand(body.command, cwd, Number(body.timeoutMs ?? 30000));
    sendJson(response, 200, {
      project,
      command: body.command,
      cwd: toProjectRelative(project.rootPath, cwd),
      durationMs: elapsed(started),
      ...result
    });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/tools") {
    const body = await readJson<ApiToolsFile>(request);
    let config: ApiToolsFile;
    try {
      config = writeApiTools(body);
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid tool configuration"
      });
      return;
    }
    sendJson(response, 200, {
      config,
      tools: getApiToolStatuses(config)
    });
    return;
  }

  if (request.method === "GET") {
    serveStatic(response, webRoot, url.pathname);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function routeAndLog(
  store: SqliteAboTStore,
  body: RouteRequest,
  defaultProjectRoot: string
): Promise<RouteResponse> {
  const totalStart = performance.now();
  if (!body.task?.trim()) throw new Error("task is required");
  const mode = body.mode === "fixed_agent" ? "fixed_agent" : "orchestrated";
  const fixedAgent = normalizeAgentName(body.fixedAgent);

  const projectStart = performance.now();
  const project = body.projectId
    ? findProjectOrCreate(store, body.projectId, defaultProjectRoot)
    : store.ensureProject({
        name: body.projectName,
        rootPath: body.rootPath || defaultProjectRoot
      });
  const projectMs = elapsed(projectStart);

  const normalizeStart = performance.now();
  const openFiles = normalizeStringArray(body.openFiles);
  const changedFiles = normalizeStringArray(body.changedFiles);
  const fileSet = [...new Set([...openFiles, ...changedFiles])];
  const contextCandidates = fileSet.map((path) => ({
    path,
    source: changedFiles.includes(path) ? ("changed" as const) : ("open" as const)
  }));
  const taskEstimateTokens = estimateTokenCount(body.task);
  const normalizeMs = elapsed(normalizeStart);

  const budgetStart = performance.now();
  const budgetRemainingBefore = store.getBudgetRemaining(project.id);
  const budgetMs = elapsed(budgetStart);

  const planInput = {
    task: body.task,
    openFiles,
    changedFiles,
    diffLines: Number(body.diffLines ?? 0),
    contextCandidates
  };
  const planningStart = performance.now();
  const planned =
    mode === "fixed_agent"
      ? planFixedAgent(planInput, fixedAgent ?? "unspecified-high")
      : await planTaskWithFallback(planInput, {
          routingOptions: {
            sessionBudgetRemaining: budgetRemainingBefore
          }
        });
  const planningMs = elapsed(planningStart);

  const affinityStart = performance.now();
  if (mode === "orchestrated") {
    applySessionAffinity(store, project.id, planned, budgetRemainingBefore);
  }
  const affinityMs = elapsed(affinityStart);

  const estimatedInputTokens = taskEstimateTokens + planned.contextEstimateTokens;
  const estimatedOutputTokens = estimateOutputTokens(planned);
  const timings = {
    projectMs,
    normalizeMs,
    budgetMs,
    planningMs,
    affinityMs,
    dbLogMs: 0,
    totalRequestMs: 0,
    ...planned.timings
  };
  const metrics = {
    mode,
    fixedAgent: mode === "fixed_agent" ? planned.decision.agent : undefined,
    selectedAgent: planned.decision.agent,
    taskEstimateTokens,
    contextEstimateTokens: planned.contextEstimateTokens,
    estimatedInputTokens,
    estimatedOutputTokens,
    contextBudgetTokens: planned.decision.contextBudgetTokens,
    contextBudgetWarning: planned.contextBudgetWarning,
    llmFallbackUsed: planned.llmFallbackUsed,
    budgetRemainingBefore,
    orchestrationBypassed: mode === "fixed_agent"
  };

  const dbStart = performance.now();
  const route = store.logRoute({
    projectId: project.id,
    task: body.task,
    mode,
    fixedAgent: mode === "fixed_agent" ? planned.decision.agent : undefined,
    openFiles,
    changedFiles,
    diffLines: Number(body.diffLines ?? 0),
    verdict: planned.verdict,
    decision: planned.decision,
    context: planned.context,
    contextEstimateTokens: planned.contextEstimateTokens,
    contextBudgetWarning: planned.contextBudgetWarning,
    taskEstimateTokens,
    estimatedInputTokens,
    estimatedOutputTokens,
    timings: {
      ...timings,
      dbLogMs: 0,
      totalRequestMs: 0
    },
    metrics
  });
  const dbLogMs = elapsed(dbStart);
  const totalRequestMs = elapsed(totalStart);
  const finalMetrics = {
    ...metrics,
    budgetRemainingAfter: store.getBudgetRemaining(project.id),
    dbLogMs,
    totalRequestMs
  };
  route.timings = {
    ...timings,
    dbLogMs,
    totalRequestMs
  };
  route.metrics = finalMetrics;
  store.updateRouteTelemetry({
    id: route.id,
    timings: route.timings,
    metrics: finalMetrics
  });

  return {
    project,
    route,
    planned,
    budgetRemaining: store.getBudgetRemaining(project.id)
  };
}

function applySessionAffinity(
  store: SqliteAboTStore,
  projectId: string,
  planned: PlannedTask,
  budgetRemainingBefore: number
): void {
  const affinityAgent = store.findAffinityAgent({
    projectId,
    intent: planned.verdict.intent,
    window: 3
  });

  if (!affinityAgent || affinityAgent === planned.decision.agent) return;
  if (planned.decision.warnings.includes("llm-fallback-needed")) return;

  const affinityCost = getAgentCostUnits(affinityAgent);
  if (affinityCost > budgetRemainingBefore) return;

  planned.decision = {
    ...planned.decision,
    agent: affinityAgent,
    costUnits: affinityCost,
    reason: `${planned.decision.reason}; session affinity kept ${affinityAgent}`,
    warnings: [...planned.decision.warnings, `session-affinity:${affinityAgent}`]
  };
}

function findProjectOrCreate(store: SqliteAboTStore, projectId: string, defaultProjectRoot: string): ProjectRecord {
  const project = store.listProjects().find((candidate) => candidate.id === projectId);
  return project ?? store.ensureProject({ rootPath: defaultProjectRoot, name: "AboT" });
}

function getProjectOrThrow(store: SqliteAboTStore, projectId: string | undefined | null, defaultProjectRoot: string): ProjectRecord {
  if (!projectId) return store.ensureProject({ rootPath: defaultProjectRoot, name: "AboT" });
  const project = store.listProjects().find((candidate) => candidate.id === projectId);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return project;
}

async function executeAndLog(
  store: SqliteAboTStore,
  result: RouteResponse,
  timeoutMs: number
): Promise<Record<string, unknown> & { status: string; content: string }> {
  const executionStart = performance.now();

  try {
    const execution = await executeAgentTask({
      agent: result.planned.decision.agent,
      messages: buildExecutionMessages(result),
      contextBudgetTokens: result.planned.decision.contextBudgetTokens,
      contextFiles: result.planned.context,
      cwd: result.project.rootPath,
      timeoutMs
    });
    const executionMs = elapsed(executionStart);
    const content = execution.content || "(Provider returned an empty response.)";

    updateExecutionTelemetry(store, result.route, {
      executionStatus: "success",
      executionProvider: execution.provider,
      executionModel: execution.model,
      executionVariant: execution.variant,
      executionFinishReason: execution.finishReason,
      executionLatencyMs: execution.latencyMs,
      executionTotalMs: executionMs,
      actualInputTokens: execution.inputTokens,
      actualOutputTokens: execution.outputTokens,
      executionAttempts: execution.attemptedModels
    });

    return {
      status: "executed",
      content,
      provider: execution.provider,
      model: execution.model,
      variant: execution.variant,
      inputTokens: execution.inputTokens,
      outputTokens: execution.outputTokens,
      latencyMs: execution.latencyMs,
      finishReason: execution.finishReason,
      attemptedModels: execution.attemptedModels
    };
  } catch (error) {
    const executionMs = elapsed(executionStart);
    const attempts = error instanceof ExecutionError ? error.details.attempts ?? [] : [];
    const message = error instanceof Error ? error.message : "Unknown execution error";

    updateExecutionTelemetry(store, result.route, {
      executionStatus: "failed",
      executionError: message,
      executionTotalMs: executionMs,
      executionAttempts: attempts
    });

    return {
      status: "failed",
      content: buildExecutionFailureMessage(result, message, attempts),
      error: message,
      attemptedModels: attempts
    };
  }
}

function buildExecutionFailureMessage(result: RouteResponse, message: string, attempts: unknown[]): string {
  const attemptLines = attempts
    .map(formatExecutionAttempt)
    .filter(Boolean);

  return [
    "Execution failed after routing.",
    `Selected agent: ${result.planned.decision.agent}`,
    `Reason: ${message}`,
    attemptLines.length ? "Attempts:" : "",
    ...attemptLines,
    "The route was still logged. Update the failing provider key/base URL or retry with a fixed agent that uses a configured provider."
  ]
    .filter(Boolean)
    .join("\n");
}

function formatExecutionAttempt(attempt: unknown): string {
  const record = attempt && typeof attempt === "object" ? (attempt as Record<string, unknown>) : {};
  const model = typeof record.model === "string" ? record.model : "unknown model";
  const variant = typeof record.variant === "string" ? `/${record.variant}` : "";
  const provider = typeof record.provider === "string" ? record.provider : "unknown provider";
  const status = typeof record.statusCode === "number" ? ` status ${record.statusCode}` : "";
  const error = typeof record.error === "string" ? `: ${record.error}` : "";
  return `- ${model}${variant} via ${provider}${status}${error}`;
}

function buildExecutionMessages(result: RouteResponse): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    {
      role: "system",
      content: [
        `You are AboT executing as agent ${result.planned.decision.agent}.`,
        `Router intent: ${result.planned.verdict.intent}. Complexity: ${result.planned.verdict.complexity}.`,
        "Execute inside the selected local workspace when the adapter supports it.",
        "If direct edits are unavailable, provide concise exact edits or commands to run."
      ].join("\n")
    },
    {
      role: "user",
      content: result.route.task
    }
  ];
}

function updateExecutionTelemetry(
  store: SqliteAboTStore,
  route: RouteEventRecord,
  executionMetrics: Record<string, unknown>
): void {
  route.timings = {
    ...route.timings,
    executionMs: typeof executionMetrics.executionTotalMs === "number" ? executionMetrics.executionTotalMs : 0
  };
  route.metrics = {
    ...route.metrics,
    ...executionMetrics
  };
  store.updateRouteTelemetry({
    id: route.id,
    timings: route.timings,
    metrics: route.metrics
  });
}

function buildDryRunAssistantMessage(result: RouteResponse): string {
  const { verdict, decision, contextBudgetWarning } = result.planned;
  const warnings = decision.warnings.length > 0 ? ` Warnings: ${decision.warnings.join(", ")}.` : "";
  const context = contextBudgetWarning ? " Context exceeds the selected budget." : " Context is within the selected budget.";
  return `Selected ${decision.agent} for ${verdict.intent}/${verdict.complexity} using ${decision.phase}. Cost units: ${decision.costUnits}. Estimated input/output tokens: ${result.route.estimatedInputTokens}/${result.route.estimatedOutputTokens}. Total logged time: ${result.route.timings.totalRequestMs}ms.${context}${warnings}`;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response: ServerResponse, statusCode: number, payload: string, contentType: string): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(payload);
}

function serveStatic(response: ServerResponse, webRoot: string, pathname: string): void {
  const safePath = pathname === "/" ? "/index.html" : pathname === "/favicon.ico" ? "/favicon.svg" : pathname;
  const filePath = resolve(join(webRoot, safePath));

  if (!filePath.startsWith(resolve(webRoot)) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": getMimeType(filePath),
    "cache-control": "no-store"
  });
  response.end(readFileSync(filePath));
}

function getMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function resolveProjectPath(rootPath: string, requestedPath: string): string {
  const root = resolve(rootPath);
  const target = resolve(root, requestedPath || ".");
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error("Path escapes project root");
  }
  return target;
}

function toProjectRelative(rootPath: string, targetPath: string): string {
  const rel = relative(resolve(rootPath), resolve(targetPath));
  return rel || ".";
}

function listWorkspaceEntries(rootPath: string, targetPath: string): Array<{
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: string;
}> {
  const stat = statSync(targetPath);
  if (!stat.isDirectory()) throw new Error("Path is not a directory");
  const ignored = new Set([".git", "node_modules", "dist", ".next", ".turbo"]);
  return readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => !ignored.has(entry.name))
    .slice(0, 300)
    .map((entry) => {
      const absolute = join(targetPath, entry.name);
      const entryStat = statSync(absolute);
      const type: "directory" | "file" = entry.isDirectory() ? "directory" : "file";
      return {
        name: entry.name,
        path: toProjectRelative(rootPath, absolute),
        type,
        size: entryStat.size,
        modifiedAt: entryStat.mtime.toISOString()
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

async function runWorkspaceCommand(command: string, cwd: string, timeoutMs: number): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  // Local-first full-access workspace command execution. Do not expose this API over a network.
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: Math.max(1000, Math.min(timeoutMs, 120000)),
      maxBuffer: 1024 * 1024 * 3,
      windowsHide: true,
      shell: process.platform === "win32" ? "powershell.exe" : undefined
    });
    return {
      exitCode: 0,
      stdout,
      stderr,
      timedOut: false
    };
  } catch (error) {
    const err = error as { code?: number | null; stdout?: string; stderr?: string; killed?: boolean };
    return {
      exitCode: typeof err.code === "number" ? err.code : null,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      timedOut: Boolean(err.killed)
    };
  }
}

function normalizeAgentName(value: unknown): AgentName | undefined {
  if (typeof value !== "string") return undefined;
  const agentSet = new Set(AGENT_NAMES);
  return agentSet.has(value) ? value : undefined;
}

function estimateOutputTokens(planned: PlannedTask): number {
  switch (planned.verdict.complexity) {
    case "low":
      return 500;
    case "medium":
      return 1000;
    case "high":
      return 2000;
    case "ultra":
      return 4000;
  }
}

function getSetupStatus(): Record<string, unknown> {
  const router = getEnvLlmRouterOptions();
  const tools = getApiToolStatuses();
  const executionTool = tools.find((tool) => tool.id === "execution");
  const openAgentConfigPath = getOpenAgentConfigPath();

  return {
    envFile: ".env.local",
    envFileIgnored: isEnvFileIgnored(),
    router: {
      configured: Boolean(router.enabled),
      provider: router.provider,
      model: router.model ?? "",
      baseUrl: router.baseUrl ?? "",
      baseUrlConfigured: Boolean(router.baseUrl),
      apiKeyConfigured: Boolean(router.apiKey)
    },
    execution: {
      configured: Boolean(executionTool?.configured),
      openAgentConfigPath,
      openAgentConfigExists: existsSync(openAgentConfigPath),
      providers: {
        auto: process.env.ABOT_EXECUTION_ADAPTER === "auto",
        codexCli: process.env.ABOT_EXECUTION_ADAPTER === "codex-cli" || process.env.ABOT_EXECUTION_ADAPTER === "auto",
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY),
        opencodeGo: Boolean(process.env.OPENCODE_GO_BASE_URL)
      },
      adapter: process.env.ABOT_EXECUTION_ADAPTER ?? "openai-compatible",
      codexModel: process.env.ABOT_CODEX_MODEL ?? "",
      modelOverride: process.env.ABOT_EXECUTION_MODEL ?? "",
      fallbackModel: process.env.ABOT_EXECUTION_FALLBACK_MODEL ?? "",
      missingEnv: executionTool?.missingEnv ?? []
    },
    tools
  };
}

async function probeRouterModel(): Promise<Record<string, unknown>> {
  const router = getEnvLlmRouterOptions();
  const started = performance.now();

  if (!router.enabled || !router.baseUrl || !router.apiKey || !router.model) {
    return {
      ok: false,
      skipped: true,
      provider: router.provider,
      model: router.model ?? "",
      message: "Set a router model and API key to run a live confirm test."
    };
  }

  const verdict: RouterVerdict = {
    phase: "llm_fallback_needed",
    intent: "code_impl",
    complexity: "low",
    scope: "execution",
    confidence: 0.35,
    deterministicScore: 0.35,
    suggestedAgent: "atlas",
    candidateAgents: ["atlas", "unspecified-high"],
    intentScores: {
      code_impl: 0.35
    },
    secondaryIntents: [],
    multiIntent: false,
    signals: ["probe:router"],
    reason: "Router live probe"
  };
  const diagnostics: LlmRouterDiagnostics = {};
  const choice = await classifyWithLlmFallback(
    {
      task: "Check whether the AboT router API is working.",
      openFiles: [],
      changedFiles: [],
      diffLines: 0
    },
    verdict,
    router,
    diagnostics
  );

  if (choice) {
    return {
      ok: true,
      provider: router.provider,
      model: router.model,
      selectedAgent: choice.agent,
      latencyMs: elapsed(started)
    };
  }

  return {
    ok: false,
    provider: router.provider,
    model: router.model,
    statusCode: diagnostics.failure?.statusCode,
    message: formatLlmRouterFailure(diagnostics.failure),
    latencyMs: elapsed(started)
  };
}

async function probeExecutionModel(): Promise<Record<string, unknown>> {
  const model = process.env.ABOT_EXECUTION_MODEL?.trim();
  if (process.env.ABOT_EXECUTION_ADAPTER === "codex-cli" || process.env.ABOT_EXECUTION_ADAPTER === "auto") {
    try {
      const result = await executeAgentTask({
        agent: process.env.ABOT_EXECUTION_ADAPTER === "auto" ? "unspecified-low" : "unspecified-high",
        messages: [{ role: "user", content: "Reply with exactly ok. Do not modify files." }],
        contextBudgetTokens: 0,
        contextFiles: [],
        cwd: process.cwd(),
        timeoutMs: 45000
      });

      return {
        ok: true,
        model: result.model,
        provider: result.provider,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        attemptedModels: result.attemptedModels
      };
    } catch (error) {
      const executionError = error instanceof ExecutionError ? error : undefined;
      return {
        ok: false,
        model: model || "codex/gpt-5.5",
        provider: executionError?.details.provider ?? "codex-cli",
        statusCode: executionError?.details.statusCode,
        message: error instanceof Error ? error.message : "Codex execution probe failed"
      };
    }
  }

  if (!model) {
    return {
      ok: false,
      skipped: true,
      message: "Set a single execution model to run a live confirm test."
    };
  }

  try {
    const result = await executeTask({
      agent: "unspecified-high",
      model,
      messages: [{ role: "user", content: "Reply with exactly ok." }],
      contextBudgetTokens: 0,
      contextFiles: [],
      timeoutMs: 15000
    });

    return {
      ok: true,
      model: result.model,
      provider: result.provider,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    };
  } catch (error) {
    const executionError = error instanceof ExecutionError ? error : undefined;
    return {
      ok: false,
      model,
      provider: executionError?.details.provider,
      statusCode: executionError?.details.statusCode,
      message: error instanceof Error ? error.message : "Execution probe failed"
    };
  }
}

function buildSetupEnvUpdates(body: ApiSetupRequest): Record<string, string | undefined> {
  const updates: Record<string, string | undefined> = {
    ABOT_OPENAGENT_CONFIG: nonEmpty(body.openAgentConfig)
  };
  const routerProvider = body.routerProvider === "gemini" ? "gemini" : body.routerProvider === "openai-compatible" ? "openai-compatible" : undefined;
  const routerModel = nonEmpty(body.routerModel);

  if (routerProvider) {
    updates.ABOT_ROUTER_PROVIDER = routerProvider;
    if (routerModel) updates.ABOT_ROUTER_MODEL = routerModel;

    if (routerProvider === "gemini") {
      updates.ABOT_ROUTER_BASE_URL = GEMINI_OPENAI_COMPAT_BASE_URL;
      updates.GEMINI_API_KEY = nonEmpty(body.routerApiKey);
    } else {
      updates.ABOT_ROUTER_BASE_URL = nonEmpty(body.routerBaseUrl);
      updates.ABOT_ROUTER_API_KEY = nonEmpty(body.routerApiKey);
    }
  }

  const executionApiKey = nonEmpty(body.executionApiKey);
  updates.ABOT_EXECUTION_ADAPTER =
    body.executionProvider === "auto" ? "auto" : body.executionProvider === "codex-cli" ? "codex-cli" : "openai-compatible";
  updates.ABOT_CODEX_MODEL = body.executionProvider === "codex-cli" || body.executionProvider === "auto"
    ? nonEmpty(body.executionModel)
    : undefined;
  updates.ABOT_EXECUTION_MODEL = normalizeExecutionModel(body.executionProvider, body.executionModel);
  updates.ABOT_EXECUTION_FALLBACK_MODEL = body.executionProvider === "auto"
    ? normalizeExecutionModel("gemini", body.routerModel || "gemini-3.1-flash-lite")
    : undefined;
  switch (body.executionProvider) {
    case "auto":
    case "gemini":
      updates.GEMINI_API_KEY = executionApiKey;
      break;
    case "openai":
      updates.OPENAI_API_KEY = executionApiKey;
      break;
    case "openrouter":
      updates.OPENROUTER_API_KEY = executionApiKey;
      break;
    case "opencode-go":
      updates.OPENCODE_GO_API_KEY = executionApiKey;
      break;
  }

  updates.OPENCODE_GO_BASE_URL = nonEmpty(body.opencodeGoBaseUrl);

  return updates;
}

function normalizeExecutionModel(provider: ApiSetupRequest["executionProvider"], value: unknown): string | undefined {
  const model = nonEmpty(value);
  if (!model) return undefined;
  if (model.includes("/")) return model;

  switch (provider) {
    case "gemini":
      return `google/${model}`;
    case "auto":
    case "codex-cli":
      return `codex/${model}`;
    case "openai":
      return `openai/${model}`;
    case "openrouter":
      return `openrouter/${model}`;
    case "opencode-go":
      return `opencode-go/${model}`;
    default:
      return model;
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isEnvFileIgnored(): boolean {
  if (!existsSync(".gitignore")) return false;
  const gitignore = readFileSync(".gitignore", "utf8");
  return /^\.env(?:\.\*)?$/m.test(gitignore) || /^\.env\.local$/m.test(gitignore);
}

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

function routesToCsv(routes: RouteEventRecord[]): string {
  const headers = [
    "id",
    "createdAt",
    "projectId",
    "mode",
    "fixedAgent",
    "selectedAgent",
    "phase",
    "intent",
    "complexity",
    "costUnits",
    "taskEstimateTokens",
    "contextEstimateTokens",
    "estimatedInputTokens",
    "estimatedOutputTokens",
    "contextBudgetTokens",
    "contextBudgetWarning",
    "llmFallbackUsed",
    "budgetRemainingBefore",
    "budgetRemainingAfter",
    "totalRequestMs",
    "planningMs",
    "classifyMs",
    "llmFallbackMs",
    "contextMs",
    "resolveMs",
    "dbLogMs",
    "executionStatus",
    "executionProvider",
    "executionModel",
    "executionLatencyMs",
    "executionTotalMs",
    "executionFinishReason",
    "executionError",
    "executionAttempts",
    "actualInputTokens",
    "actualOutputTokens",
    "decisionReason",
    "warnings",
    "task"
  ];

  const rows = routes.map((route) => {
    const verdict = route.verdict as { intent?: string; complexity?: string };
    const metrics = route.metrics ?? {};
    return [
      route.id,
      route.createdAt,
      route.projectId,
      route.mode,
      route.fixedAgent ?? "",
      route.decision.agent,
      route.decision.phase,
      verdict.intent ?? "",
      verdict.complexity ?? "",
      route.decision.costUnits,
      route.taskEstimateTokens,
      route.contextEstimateTokens,
      route.estimatedInputTokens,
      route.estimatedOutputTokens,
      route.decision.contextBudgetTokens,
      route.contextBudgetWarning,
      metrics.llmFallbackUsed ?? "",
      metrics.budgetRemainingBefore ?? "",
      metrics.budgetRemainingAfter ?? "",
      route.timings.totalRequestMs ?? "",
      route.timings.planningMs ?? "",
      route.timings.classifyMs ?? "",
      route.timings.llmFallbackMs ?? "",
      route.timings.contextMs ?? "",
      route.timings.resolveMs ?? "",
      route.timings.dbLogMs ?? "",
      metrics.executionStatus ?? "",
      metrics.executionProvider ?? "",
      metrics.executionModel ?? "",
      metrics.executionLatencyMs ?? "",
      metrics.executionTotalMs ?? "",
      metrics.executionFinishReason ?? "",
      metrics.executionError ?? "",
      formatCsvJson(metrics.executionAttempts),
      metrics.actualInputTokens ?? "",
      metrics.actualOutputTokens ?? "",
      route.decision.reason,
      route.decision.warnings.join(";"),
      route.task
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCsvJson(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return JSON.stringify(value);
}

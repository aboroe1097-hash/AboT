import { routeOpenCodeTask } from "@abot/adapters-opencode";

interface HookPayload {
  task?: string;
  prompt?: string;
  files?: string[];
  openFiles?: string[];
  changedFiles?: string[];
  diffLines?: number;
  projectId?: string;
  rootPath?: string;
  mode?: "orchestrated" | "fixed_agent";
  fixedAgent?: string;
}

const payload = await readStdinJson<HookPayload>();
const serverUrl = process.env.ABOT_SERVER_URL ?? "http://127.0.0.1:3217";
const task = payload.task ?? payload.prompt ?? "";
const files = payload.files ?? payload.openFiles ?? [];

if (!task.trim()) {
  writeJson({ error: "task or prompt is required" });
  process.exit(1);
}

const routed = await routeViaServer(serverUrl, {
  task,
  mode: payload.mode,
  fixedAgent: payload.fixedAgent,
  projectId: payload.projectId,
  rootPath: payload.rootPath,
  openFiles: files,
  changedFiles: payload.changedFiles ?? [],
  diffLines: payload.diffLines ?? 0
}).catch(() => undefined);

if (routed) {
  writeJson({
    agent: routed.planned.decision.agent,
    contextBudgetTokens: routed.planned.decision.contextBudgetTokens,
    warnings: routed.planned.decision.warnings,
    phase: routed.planned.decision.phase,
    routeId: routed.route.id,
    source: "abot-server"
  });
} else {
  const local = routeOpenCodeTask({
    task,
    files,
    diffLines: payload.diffLines ?? 0
  });

  writeJson({
    agent: local.decision.agent,
    contextBudgetTokens: local.decision.contextBudgetTokens,
    warnings: [...local.decision.warnings, "server-unavailable-local-route"],
    phase: local.decision.phase,
    source: "local-fallback"
  });
}

async function routeViaServer(serverUrl: string, body: Record<string, unknown>) {
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/route`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`AboT server returned ${response.status}`);
  return (await response.json()) as {
    planned: {
      decision: {
        agent: string;
        contextBudgetTokens: number;
        warnings: string[];
        phase: string;
      };
    };
    route: {
      id: string;
    };
  };
}

async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return JSON.parse(raw || "{}") as T;
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

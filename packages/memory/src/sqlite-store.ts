import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentName, RouterIntent } from "@abot/router";
import type { ChatMessageRecord, ProjectRecord, RouteEventInput, RouteEventRecord } from "./index.js";

interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  session_budget_units: number;
  preferences_json: string;
  created_at: string;
  updated_at: string;
}

interface RouteEventRow {
  id: string;
  project_id: string;
  task: string;
  mode: string;
  fixed_agent: string | null;
  open_files_json: string;
  changed_files_json: string;
  diff_lines: number;
  verdict_json: string;
  decision_json: string;
  context_json: string;
  context_estimate_tokens: number;
  context_budget_warning: number;
  task_estimate_tokens: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  timings_json: string;
  metrics_json: string;
  selected_agent: string;
  phase: string;
  intent: string;
  complexity: string;
  cost_units: number;
  created_at: string;
}

interface ChatMessageRow {
  id: string;
  project_id: string;
  route_event_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export class SqliteAboTStore {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  ensureProject(input: { name?: string; rootPath?: string; sessionBudgetUnits?: number }): ProjectRecord {
    const rootPath = input.rootPath?.trim() || process.cwd();
    const existing = this.db
      .prepare("SELECT * FROM projects WHERE root_path = ?")
      .get(rootPath) as ProjectRow | undefined;

    if (existing) return mapProject(existing);

    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: randomUUID(),
      name: input.name?.trim() || inferProjectName(rootPath),
      rootPath,
      sessionBudgetUnits: input.sessionBudgetUnits ?? 100,
      preferences: {},
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO projects (id, name, root_path, session_budget_units, preferences_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.id,
        project.name,
        project.rootPath,
        project.sessionBudgetUnits,
        JSON.stringify(project.preferences),
        project.createdAt,
        project.updatedAt
      );

    return project;
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as unknown as ProjectRow[];
    return rows.map(mapProject);
  }

  logRoute(input: RouteEventInput): RouteEventRecord {
    const now = new Date().toISOString();
    const id = randomUUID();
    const verdict = input.verdict as { intent?: string; complexity?: string };

    this.db
      .prepare(
        `INSERT INTO route_events (
          id, project_id, task, mode, fixed_agent, open_files_json, changed_files_json, diff_lines,
          verdict_json, decision_json, context_json, context_estimate_tokens,
          context_budget_warning, task_estimate_tokens, estimated_input_tokens, estimated_output_tokens,
          timings_json, metrics_json, selected_agent, phase, intent, complexity, cost_units, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.task,
        input.mode,
        input.fixedAgent ?? null,
        JSON.stringify(input.openFiles),
        JSON.stringify(input.changedFiles),
        input.diffLines,
        JSON.stringify(input.verdict),
        JSON.stringify(input.decision),
        JSON.stringify(input.context),
        input.contextEstimateTokens,
        input.contextBudgetWarning ? 1 : 0,
        input.taskEstimateTokens,
        input.estimatedInputTokens,
        input.estimatedOutputTokens,
        JSON.stringify(input.timings),
        JSON.stringify(input.metrics),
        input.decision.agent,
        input.decision.phase,
        verdict.intent ?? "unknown",
        verdict.complexity ?? "unknown",
        input.decision.costUnits,
        now
      );

    this.touchProject(input.projectId);
    return { ...input, id, createdAt: now };
  }

  updateRouteTelemetry(input: {
    id: string;
    timings: Record<string, number>;
    metrics: Record<string, unknown>;
  }): void {
    this.db
      .prepare("UPDATE route_events SET timings_json = ?, metrics_json = ? WHERE id = ?")
      .run(JSON.stringify(input.timings), JSON.stringify(input.metrics), input.id);
  }

  listRoutes(input: { projectId?: string; limit?: number }): RouteEventRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const rows = input.projectId
      ? (this.db
          .prepare("SELECT * FROM route_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(input.projectId, limit) as unknown as RouteEventRow[])
      : (this.db.prepare("SELECT * FROM route_events ORDER BY created_at DESC LIMIT ?").all(limit) as unknown as RouteEventRow[]);

    return rows.map(mapRouteEvent);
  }

  exportRoutes(input: { projectId?: string; limit?: number }): RouteEventRecord[] {
    return this.listRoutes(input);
  }

  getBudgetRemaining(projectId: string): number {
    const project = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!project) return 100;

    const row = this.db
      .prepare("SELECT COALESCE(SUM(cost_units), 0) AS used FROM route_events WHERE project_id = ?")
      .get(projectId) as { used: number };

    return Math.max(0, project.session_budget_units - Number(row.used ?? 0));
  }

  findAffinityAgent(input: { projectId: string; intent: RouterIntent; window?: number }): AgentName | undefined {
    const limit = Math.max(1, Math.min(input.window ?? 3, 10));
    const rows = this.db
      .prepare("SELECT selected_agent, intent FROM route_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(input.projectId, limit) as Array<{ selected_agent: AgentName; intent: RouterIntent }>;

    const match = rows.find((row) => row.intent === input.intent);
    return match?.selected_agent;
  }

  addChatMessage(input: {
    projectId: string;
    routeEventId?: string;
    role: "user" | "assistant" | "system";
    content: string;
  }): ChatMessageRecord {
    const record: ChatMessageRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      routeEventId: input.routeEventId,
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `INSERT INTO chat_messages (id, project_id, route_event_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.projectId, record.routeEventId ?? null, record.role, record.content, record.createdAt);

    this.touchProject(input.projectId);
    return record;
  }

  listChatMessages(input: { projectId: string; limit?: number }): ChatMessageRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 300));
    const rows = this.db
      .prepare("SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC LIMIT ?")
      .all(input.projectId, limit) as unknown as ChatMessageRow[];

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      routeEventId: row.route_event_id ?? undefined,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  private touchProject(projectId: string): void {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), projectId);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        session_budget_units INTEGER NOT NULL DEFAULT 100,
        preferences_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS route_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'orchestrated',
        fixed_agent TEXT,
        open_files_json TEXT NOT NULL,
        changed_files_json TEXT NOT NULL,
        diff_lines INTEGER NOT NULL DEFAULT 0,
        verdict_json TEXT NOT NULL,
        decision_json TEXT NOT NULL,
        context_json TEXT NOT NULL,
        context_estimate_tokens INTEGER NOT NULL DEFAULT 0,
        context_budget_warning INTEGER NOT NULL DEFAULT 0,
        task_estimate_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_output_tokens INTEGER NOT NULL DEFAULT 0,
        timings_json TEXT NOT NULL DEFAULT '{}',
        metrics_json TEXT NOT NULL DEFAULT '{}',
        selected_agent TEXT NOT NULL,
        phase TEXT NOT NULL,
        intent TEXT NOT NULL,
        complexity TEXT NOT NULL,
        cost_units INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_route_events_project_created
        ON route_events(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        route_event_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(route_event_id) REFERENCES route_events(id)
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_project_created
        ON chat_messages(project_id, created_at ASC);
    `);

    this.ensureRouteEventColumn("mode", "TEXT NOT NULL DEFAULT 'orchestrated'");
    this.ensureRouteEventColumn("fixed_agent", "TEXT");
    this.ensureRouteEventColumn("task_estimate_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureRouteEventColumn("estimated_input_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureRouteEventColumn("estimated_output_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureRouteEventColumn("timings_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureRouteEventColumn("metrics_json", "TEXT NOT NULL DEFAULT '{}'");
  }

  private ensureRouteEventColumn(name: string, definition: string): void {
    const columns = this.db.prepare("PRAGMA table_info(route_events)").all() as unknown as Array<{ name: string }>;
    if (columns.some((column) => column.name === name)) return;
    this.db.exec(`ALTER TABLE route_events ADD COLUMN ${name} ${definition};`);
  }
}

function inferProjectName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).pop() || "AboT Project";
}

function mapProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    sessionBudgetUnits: Number(row.session_budget_units),
    preferences: parseJsonObject(row.preferences_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRouteEvent(row: RouteEventRow): RouteEventRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    task: row.task,
    mode: (row.mode === "fixed_agent" ? "fixed_agent" : "orchestrated") as RouteEventRecord["mode"],
    fixedAgent: row.fixed_agent ?? undefined,
    openFiles: parseJsonArray(row.open_files_json),
    changedFiles: parseJsonArray(row.changed_files_json),
    diffLines: row.diff_lines,
    verdict: parseJsonObject(row.verdict_json),
    decision: parseJsonObject(row.decision_json) as RouteEventRecord["decision"],
    context: parseJsonValue(row.context_json),
    contextEstimateTokens: row.context_estimate_tokens,
    contextBudgetWarning: row.context_budget_warning === 1,
    taskEstimateTokens: row.task_estimate_tokens,
    estimatedInputTokens: row.estimated_input_tokens,
    estimatedOutputTokens: row.estimated_output_tokens,
    timings: parseJsonObject(row.timings_json) as Record<string, number>,
    metrics: parseJsonObject(row.metrics_json),
    createdAt: row.created_at
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

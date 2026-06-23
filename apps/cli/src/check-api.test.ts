import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAboTServer } from "@abot/server";

const tmpDir = resolve(".tmp-test-vitest", randomUUID());
const dbPath = resolve(tmpDir, "abot-api-test.sqlite");
const workspaceRoot = resolve(tmpDir, "workspace");

let baseUrl = "";
let server: Server;

beforeAll(async () => {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(workspaceRoot, { recursive: true });
  server = createAboTServer({
    dbPath,
    defaultProjectRoot: resolve(".")
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("Failed to start test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AboT API", () => {
  it("routes, chats, manages workspace files, runs commands, and exports logs", async () => {
    const health = await fetchJson(`${baseUrl}/api/health`);
    expect(health.ok).toBe(true);

    const projects = await fetchJson(`${baseUrl}/api/projects`);
    const projectId = projects.projects[0].id as string;
    expect(projectId).toBeTruthy();

    const workspaceProject = await fetchJson(`${baseUrl}/api/projects`, {
      method: "POST",
      body: {
        name: "workspace-test",
        rootPath: workspaceRoot
      }
    });
    const workspaceProjectId = workspaceProject.project.id as string;

    const route = await fetchJson(`${baseUrl}/api/route`, {
      method: "POST",
      body: {
        projectId,
        task: "add responsive css polish",
        openFiles: ["apps/web/src/app.css"],
        changedFiles: [],
        diffLines: 0
      }
    });
    expect(route.planned.decision.agent).toBe("visual-engineering");

    const fixed = await fetchJson(`${baseUrl}/api/route`, {
      method: "POST",
      body: {
        projectId,
        mode: "fixed_agent",
        fixedAgent: "atlas",
        task: "add responsive css polish",
        openFiles: ["apps/web/src/app.css"],
        changedFiles: [],
        diffLines: 0
      }
    });
    expect(fixed.planned.decision.agent).toBe("atlas");
    expect(fixed.route.mode).toBe("fixed_agent");

    const chat = await fetchJson(`${baseUrl}/api/chat`, {
      method: "POST",
      body: {
        projectId,
        task: "fix the auth regression",
        openFiles: ["src/auth.ts"],
        changedFiles: [],
        diffLines: 0
      }
    });
    expect(chat.execution.status).toBe("dry-run");

    const tools = await fetchJson(`${baseUrl}/api/tools`);
    expect(Array.isArray(tools.tools)).toBe(true);

    const rejectedTools = await fetch(`${baseUrl}/api/tools`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tools: [
          {
            id: "bad-secret",
            label: "Bad Secret",
            kind: "openai-compatible-chat",
            enabled: true,
            apiKeyEnv: "sk-this-should-not-be-saved"
          }
        ]
      })
    });
    expect(rejectedTools.status).toBe(400);

    const write = await fetchJson(`${baseUrl}/api/workspace/file`, {
      method: "PUT",
      body: {
        projectId: workspaceProjectId,
        path: "notes/test.txt",
        content: "hello from abot"
      }
    });
    expect(write.ok).toBe(true);

    const file = await fetchJson(`${baseUrl}/api/workspace/file?projectId=${workspaceProjectId}&path=notes/test.txt`);
    expect(file.content).toBe("hello from abot");

    const tree = await fetchJson(`${baseUrl}/api/workspace/tree?projectId=${workspaceProjectId}&path=.`);
    expect(tree.entries.some((entry: { name: string }) => entry.name === "notes")).toBe(true);

    const command = await fetchJson(`${baseUrl}/api/workspace/command`, {
      method: "POST",
      body: {
        projectId: workspaceProjectId,
        command: "node -e \"console.log('abot-ok')\"",
        timeoutMs: 10000
      }
    });
    expect(String(command.stdout)).toContain("abot-ok");

    const exportedJson = await fetchJson(`${baseUrl}/api/export/routes?projectId=${projectId}&format=json`);
    expect(exportedJson.routes.length).toBeGreaterThanOrEqual(2);

    const exportedCsv = await fetchText(`${baseUrl}/api/export/routes?projectId=${projectId}&format=csv`);
    expect(exportedCsv).toContain("totalRequestMs");
    expect(exportedCsv).toContain("fixed_agent");
    expect(exportedCsv).toContain("executionStatus");
  });
});

async function fetchJson(url: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${url} failed: ${JSON.stringify(json)}`);
  return json as any;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} failed: ${text}`);
  return text;
}

import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createAboTServer } from "@abot/server";

const tmpDir = resolve(".tmp-test");
const dbPath = resolve(tmpDir, "abot-api-test.sqlite");
const workspaceRoot = resolve(tmpDir, "workspace");
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(workspaceRoot, { recursive: true });

const server = createAboTServer({
  dbPath,
  defaultProjectRoot: resolve(".")
});

await new Promise<void>((resolveListen) => {
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Failed to start test server");
}

const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  await expectOk("health", fetchJson(`${baseUrl}/api/health`));
  const projects = await expectOk("projects", fetchJson(`${baseUrl}/api/projects`));
  const projectId = projects.projects[0].id;
  const workspaceProject = await expectOk(
    "workspace project",
    fetchJson(`${baseUrl}/api/projects`, {
      method: "POST",
      body: {
        name: "workspace-test",
        rootPath: workspaceRoot
      }
    })
  );
  const workspaceProjectId = workspaceProject.project.id;

  const route = await expectOk(
    "route",
    fetchJson(`${baseUrl}/api/route`, {
      method: "POST",
      body: {
        projectId,
        task: "add responsive css polish",
        openFiles: ["apps/web/src/app.css"],
        changedFiles: [],
        diffLines: 0
      }
    })
  );

  if (route.planned.decision.agent !== "visual-engineering") {
    throw new Error(`Expected visual-engineering, got ${route.planned.decision.agent}`);
  }

  const fixed = await expectOk(
    "fixed-agent route",
    fetchJson(`${baseUrl}/api/route`, {
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
    })
  );

  if (fixed.planned.decision.agent !== "atlas" || fixed.route.mode !== "fixed_agent") {
    throw new Error("Expected fixed-agent baseline to force atlas");
  }

  await expectOk(
    "chat",
    fetchJson(`${baseUrl}/api/chat`, {
      method: "POST",
      body: {
        projectId,
        task: "fix the auth regression",
        openFiles: ["src/auth.ts"],
        changedFiles: [],
        diffLines: 0
      }
    })
  );

  const tools = await expectOk("tools", fetchJson(`${baseUrl}/api/tools`));
  if (!Array.isArray(tools.tools)) throw new Error("Expected tools array");

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
  if (rejectedTools.status !== 400) throw new Error("Expected actual API key values to be rejected");
  console.log("PASS tools reject secret values");

  await expectOk(
    "workspace write",
    fetchJson(`${baseUrl}/api/workspace/file`, {
      method: "PUT",
      body: {
        projectId: workspaceProjectId,
        path: "notes/test.txt",
        content: "hello from abot"
      }
    })
  );

  const file = await expectOk(
    "workspace read",
    fetchJson(`${baseUrl}/api/workspace/file?projectId=${workspaceProjectId}&path=notes/test.txt`)
  );
  if (file.content !== "hello from abot") throw new Error("Expected workspace file content");

  const tree = await expectOk(
    "workspace tree",
    fetchJson(`${baseUrl}/api/workspace/tree?projectId=${workspaceProjectId}&path=.`)
  );
  if (!tree.entries.some((entry: { name: string }) => entry.name === "notes")) {
    throw new Error("Expected notes directory in tree");
  }

  const command = await expectOk(
    "workspace command",
    fetchJson(`${baseUrl}/api/workspace/command`, {
      method: "POST",
      body: {
        projectId: workspaceProjectId,
        command: "node -e \"console.log('abot-ok')\"",
        timeoutMs: 10000
      }
    })
  );
  if (!String(command.stdout).includes("abot-ok")) throw new Error("Expected command output");

  const exportedJson = await expectOk("export json", fetchJson(`${baseUrl}/api/export/routes?projectId=${projectId}&format=json`));
  if (!Array.isArray(exportedJson.routes) || exportedJson.routes.length < 2) {
    throw new Error("Expected exported routes");
  }

  const exportedCsv = await fetchText(`${baseUrl}/api/export/routes?projectId=${projectId}&format=csv`);
  if (!exportedCsv.includes("totalRequestMs") || !exportedCsv.includes("fixed_agent")) {
    throw new Error("Expected CSV export with timing and fixed-agent fields");
  }
  console.log("PASS export csv");

  console.log("PASS api smoke");
} finally {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function fetchJson(url: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${url} failed: ${JSON.stringify(json)}`);
  return json;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} failed: ${text}`);
  return text;
}

async function expectOk(label: string, promise: Promise<any>) {
  const value = await promise;
  console.log(`PASS ${label}`);
  return value;
}

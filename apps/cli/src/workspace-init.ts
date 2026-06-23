import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const targetRoot = resolve(process.argv[2] ?? process.cwd());
const projectName = process.argv[3] ?? basename(targetRoot);
const serverUrl = process.env.ABOT_SERVER_URL ?? "http://127.0.0.1:3217";
const abotDir = resolve(targetRoot, ".abot");
const configPath = resolve(abotDir, "project.json");

mkdirSync(abotDir, { recursive: true });

const config = {
  name: projectName,
  rootPath: targetRoot,
  serverUrl,
  createdAt: new Date().toISOString()
};

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const registered = await registerProject(serverUrl, config).catch((error) => ({
  ok: false,
  error: error instanceof Error ? error.message : "Failed to register project"
}));

console.log(JSON.stringify({ configPath, config, registered }, null, 2));

async function registerProject(url: string, config: { name: string; rootPath: string }) {
  const response = await fetch(`${url.replace(/\/$/, "")}/api/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: config.name,
      rootPath: config.rootPath
    })
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
  return {
    ok: true,
    project: json.project
  };
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planTask } from "@abot/core";
import type { AgentName } from "@abot/router";

interface RouterExample {
  task: string;
  files: string[];
  expectedAgent: AgentName;
}

const examplesPath = resolve("configs/router-examples.json");
const examples = JSON.parse(readFileSync(examplesPath, "utf8")) as RouterExample[];
let failures = 0;

for (const example of examples) {
  const planned = planTask({
    task: example.task,
    openFiles: example.files,
    changedFiles: example.files,
    contextCandidates: example.files.map((path) => ({
      path,
      source: "open"
    }))
  });

  const actual = planned.decision.agent;
  const pass = actual === example.expectedAgent;
  const marker = pass ? "PASS" : "FAIL";

  console.log(`${marker} ${JSON.stringify(example.task)} -> ${actual}`);

  if (!pass) {
    failures += 1;
    console.log(`  expected: ${example.expectedAgent}`);
    console.log(`  reason: ${planned.decision.reason}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}


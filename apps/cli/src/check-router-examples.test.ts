import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planTask } from "@abot/core";
import type { AgentName } from "@abot/router";

interface RouterExample {
  task: string;
  files: string[];
  expectedAgent: AgentName;
}

const examples = JSON.parse(
  readFileSync(resolve("configs/router-examples.json"), "utf8")
) as RouterExample[];

describe("router examples", () => {
  it.each(examples)("$task -> $expectedAgent", (example) => {
    const planned = planTask({
      task: example.task,
      openFiles: example.files,
      changedFiles: example.files
    });

    expect(planned.decision.agent).toBe(example.expectedAgent);
  });
});

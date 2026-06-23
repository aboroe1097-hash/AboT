import { planTask } from "@abot/core";

export interface OpenCodeHookPayload {
  task: string;
  files?: string[];
  diffLines?: number;
}

export function routeOpenCodeTask(payload: OpenCodeHookPayload) {
  return planTask({
    task: payload.task,
    openFiles: payload.files ?? [],
    changedFiles: [],
    diffLines: payload.diffLines ?? 0,
    contextCandidates: (payload.files ?? []).map((path) => ({
      path,
      source: "open"
    }))
  });
}


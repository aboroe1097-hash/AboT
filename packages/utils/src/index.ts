import { performance } from "node:perf_hooks";

export function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

export * from "./constants.js";

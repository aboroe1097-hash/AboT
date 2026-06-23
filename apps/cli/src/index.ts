import { planTask } from "@abot/core";

const task = process.argv.slice(2).join(" ").trim();

if (!task) {
  console.error("Usage: npm run cli -- \"your task\"");
  process.exitCode = 1;
} else {
  const planned = planTask({ task });
  console.log(JSON.stringify(planned, null, 2));
}


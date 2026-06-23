const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps', 'server', 'src', 'server.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = 'return typeof value === "string" && (AGENT_NAMES as readonly string[]).includes(value) ? (value as AgentName) : undefined;';
const newCode = `if (typeof value !== "string") return undefined;
  const agentSet = new Set(AGENT_NAMES);
  return agentSet.has(value) ? value : undefined;`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content, 'utf8');

console.log('Fixed type safety violation in server.ts');

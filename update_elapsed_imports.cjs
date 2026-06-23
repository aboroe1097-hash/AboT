const fs = require('fs');
const path = require('path');

// Update server.ts
const serverPath = path.join(__dirname, 'apps', 'server', 'src', 'server.ts');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Add import for elapsed
const oldServerImport = `import { writeLocalEnvValues } from "./env.js";`;
const newServerImport = `import { writeLocalEnvValues } from "./env.js";
import { elapsed } from "@abot/utils";`;
serverContent = serverContent.replace(oldServerImport, newServerImport);

// Remove the local elapsed function from server.ts
const oldServerElapsed = `function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

function routesToCsv`;
const newServerElapsed = `function routesToCsv`;
serverContent = serverContent.replace(oldServerElapsed, newServerElapsed);

fs.writeFileSync(serverPath, serverContent, 'utf8');
console.log('Updated server.ts to use shared elapsed() function');

// Update execute.ts
const executePath = path.join(__dirname, 'packages', 'executor', 'src', 'execute.ts');
let executeContent = fs.readFileSync(executePath, 'utf8');

// Add import for elapsed
const oldExecuteImport = `import { resolveProviderModel, type ProviderConfig } from "./provider-registry.js";`;
const newExecuteImport = `import { resolveProviderModel, type ProviderConfig } from "./provider-registry.js";
import { elapsed } from "@abot/utils";`;
executeContent = executeContent.replace(oldExecuteImport, newExecuteImport);

// Remove the local elapsed function from execute.ts
const oldExecuteElapsed = `function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}`;
const newExecuteElapsed = ``;
executeContent = executeContent.replace(oldExecuteElapsed, newExecuteElapsed);

fs.writeFileSync(executePath, executeContent, 'utf8');
console.log('Updated execute.ts to use shared elapsed() function');

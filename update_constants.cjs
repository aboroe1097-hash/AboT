const fs = require('fs');
const path = require('path');

// Update execute.ts to use constants
const executePath = path.join(__dirname, 'packages', 'executor', 'src', 'execute.ts');
let executeContent = fs.readFileSync(executePath, 'utf8');

// Add import for constants
const oldExecuteImport = `import { elapsed } from "@abot/utils";`;
const newExecuteImport = `import { elapsed, MAX_CONTEXT_FILES, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS } from "@abot/utils";`;
executeContent = executeContent.replace(oldExecuteImport, newExecuteImport);

// Replace hardcoded values in execute.ts
executeContent = executeContent.replace(/contextFiles\.slice\(0, 20\)/g, 'contextFiles.slice(0, MAX_CONTEXT_FILES)');
executeContent = executeContent.replace(/Math\.max\(1000, Math\.min\(request\.timeoutMs \?\? 300000, 600000\)\)/g, 'Math.max(MIN_TIMEOUT_MS, Math.min(request.timeoutMs ?? MAX_TIMEOUT_MS, MAX_TIMEOUT_MS))');
executeContent = executeContent.replace(/Math\.max\(1000, Math\.min\(timeoutMs \?\? 300000, 600000\)\)/g, 'Math.max(MIN_TIMEOUT_MS, Math.min(timeoutMs ?? MAX_TIMEOUT_MS, MAX_TIMEOUT_MS))');
executeContent = executeContent.replace(/Math\.max\(1000, Math\.min\(timeoutMs, 300000\)\)/g, 'Math.max(MIN_TIMEOUT_MS, Math.min(timeoutMs, MAX_TIMEOUT_MS))');

fs.writeFileSync(executePath, executeContent, 'utf8');
console.log('Updated execute.ts to use centralized constants');

// Update server.ts to use constants
const serverPath = path.join(__dirname, 'apps', 'server', 'src', 'server.ts');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Add import for constants
const oldServerImport = `import { elapsed } from "@abot/utils";`;
const newServerImport = `import { elapsed, MAX_WORKSPACE_ENTRIES, MAX_TASK_LENGTH, DEFAULT_COMMAND_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS } from "@abot/utils";`;
serverContent = serverContent.replace(oldServerImport, newServerImport);

// Replace hardcoded values in server.ts
serverContent = serverContent.replace(/\.slice\(0, 300\)/g, '.slice(0, MAX_WORKSPACE_ENTRIES)');
serverContent = serverContent.replace(/task\.length > 10000/g, 'task.length > MAX_TASK_LENGTH');
serverContent = serverContent.replace(/Number\(body\.timeoutMs \?\? 30000\)/g, 'Number(body.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS)');
serverContent = serverContent.replace(/Math\.max\(1000, Math\.min\(timeoutMs, 120000\)\)/g, 'Math.max(MIN_TIMEOUT_MS, Math.min(timeoutMs, 120000))');

fs.writeFileSync(serverPath, serverContent, 'utf8');
console.log('Updated server.ts to use centralized constants');

// Update sqlite-store.ts to use constants
const sqlitePath = path.join(__dirname, 'packages', 'memory', 'src', 'sqlite-store.ts');
let sqliteContent = fs.readFileSync(sqlitePath, 'utf8');

// Add import for constants
const oldSqliteImport = `import type { AgentName, RouterIntent } from "@abot/router";`;
const newSqliteImport = `import type { AgentName, RouterIntent } from "@abot/router";
import { MAX_ROUTE_LIMIT, MAX_CHAT_MESSAGE_LIMIT } from "@abot/utils";`;
sqliteContent = sqliteContent.replace(oldSqliteImport, newSqliteImport);

// Replace hardcoded values in sqlite-store.ts
sqliteContent = sqliteContent.replace(/Math\.max\(1, Math\.min\(input\.limit \?\? 50, 200\)\)/g, 'Math.max(1, Math.min(input.limit ?? 50, MAX_ROUTE_LIMIT))');
sqliteContent = sqliteContent.replace(/Math\.max\(1, Math\.min\(input\.limit \?\? 100, 300\)\)/g, 'Math.max(1, Math.min(input.limit ?? 100, MAX_CHAT_MESSAGE_LIMIT))');

fs.writeFileSync(sqlitePath, sqliteContent, 'utf8');
console.log('Updated sqlite-store.ts to use centralized constants');

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages', 'memory', 'src', 'sqlite-store.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = 'mode: (row.mode === "fixed_agent" ? "fixed_agent" : "orchestrated") as RouteEventRecord["mode"]';
const newCode = 'mode: row.mode === "fixed_agent" || row.mode === "orchestrated" ? row.mode : "orchestrated"';

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content, 'utf8');

console.log('Fixed type safety violation in sqlite-store.ts');

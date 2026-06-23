const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages', 'executor', 'src', 'execute.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the as unknown type assertion
const oldCode = 'return JSON.parse(text) as unknown;';
const newCode = 'return JSON.parse(text);';

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content, 'utf8');

console.log('Fixed type safety violation in execute.ts');

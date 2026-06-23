const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps', 'server', 'src', 'server.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = `  const server = createServer(async (request, response) => {
    try {
      await handleRequest({ request, response, store, webRoot, defaultProjectRoot });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown server error"
      });
    }
  });`;

const newCode = `  const server = createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      await handleRequest({ request, response, store, webRoot, defaultProjectRoot });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown server error";
      const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
      console.error(\`[\${requestId}] Server error: \${errorType} - \${errorMessage}\`);
      sendJson(response, 500, {
        error: errorMessage,
        requestId,
        errorType
      });
    }
  });`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content, 'utf8');

console.log('Improved error handling in server.ts');

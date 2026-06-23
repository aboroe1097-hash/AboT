const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages', 'core', 'src', 'llm-router.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = `  } catch (error) {
    recordLlmFailure(diagnostics, {
      provider: options.provider,
      model: options.model,
      message: error instanceof Error ? error.message : "Router LLM request failed."
    });
    return undefined;
  }`;

const newCode = `  } catch (error) {
    let errorMessage = "Router LLM request failed.";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Router LLM request timed out.";
      } else if (error.name === "TypeError" && error.message.includes("fetch")) {
        errorMessage = "Router LLM network error.";
      } else {
        errorMessage = error.message;
      }
    }
    recordLlmFailure(diagnostics, {
      provider: options.provider,
      model: options.model,
      message: errorMessage
    });
    return undefined;
  }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content, 'utf8');

console.log('Improved error handling in llm-router.ts');

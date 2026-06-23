import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAgentTask } from "./execute.js";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("executeAgentTask", () => {
  it("continues to a fallback provider after an auth failure", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abot-executor-"));
    const configPath = join(dir, "oh-my-openagent.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        categories: {
          "unspecified-high": {
            model: "openai/bad-primary",
            fallback_models: [{ model: "google/gemini-good" }]
          }
        }
      }),
      "utf8"
    );

    process.env.OPENAI_API_KEY = "expired";
    process.env.GEMINI_API_KEY = "valid";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "token expired or incorrect" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [{ message: { content: "fallback worked" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 11, completion_tokens: 3 }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await executeAgentTask({
        agent: "unspecified-high",
        configPath,
        contextBudgetTokens: 16000,
        contextFiles: [],
        messages: [{ role: "user", content: "hello" }]
      });

      expect(result.content).toBe("fallback worked");
      expect(result.model).toBe("google/gemini-good");
      expect(result.attemptedModels).toMatchObject([
        { model: "openai/bad-primary", ok: false, statusCode: 401 },
        { model: "google/gemini-good", ok: true, statusCode: 200 }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses a single model override without reading the OpenAgent config", async () => {
    process.env.GEMINI_API_KEY = "valid";
    process.env.ABOT_EXECUTION_MODEL = "google/gemini-override";

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        choices: [{ message: { content: "override worked" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2 }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeAgentTask({
      agent: "unspecified-high",
      configPath: "does-not-exist.json",
      contextBudgetTokens: 16000,
      contextFiles: [],
      messages: [{ role: "user", content: "hello" }]
    });

    expect(result.content).toBe("override worked");
    expect(result.model).toBe("google/gemini-override");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

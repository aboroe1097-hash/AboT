import type { AgentName, RouterInput, RouterVerdict } from "@abot/router";

export interface LlmRouterOptions {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export interface LlmRouterChoice {
  agent: AgentName;
  reasoning: string;
  raw?: unknown;
}

export function getEnvLlmRouterOptions(): LlmRouterOptions {
  return {
    enabled: Boolean(process.env.ABOT_ROUTER_API_KEY && process.env.ABOT_ROUTER_BASE_URL && process.env.ABOT_ROUTER_MODEL),
    baseUrl: process.env.ABOT_ROUTER_BASE_URL,
    apiKey: process.env.ABOT_ROUTER_API_KEY,
    model: process.env.ABOT_ROUTER_MODEL,
    timeoutMs: Number(process.env.ABOT_ROUTER_TIMEOUT_MS ?? 6000)
  };
}

export async function classifyWithLlmFallback(
  input: RouterInput,
  verdict: RouterVerdict,
  options: LlmRouterOptions = getEnvLlmRouterOptions()
): Promise<LlmRouterChoice | undefined> {
  if (!options.enabled || !options.baseUrl || !options.apiKey || !options.model) return undefined;

  const candidates = [...new Set<AgentName>([...verdict.candidateAgents, "unspecified-high"])];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);

  try {
    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a routing classifier. Pick exactly one agent from the provided candidates. Return only JSON."
          },
          {
            role: "user",
            content: buildPrompt(input, verdict, candidates)
          }
        ]
      })
    });

    if (!response.ok) return undefined;

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = parseJson(content);

    if (!parsed || !candidates.includes(parsed.agent as AgentName)) return undefined;

    return {
      agent: parsed.agent as AgentName,
      reasoning: String(parsed.reasoning ?? "LLM fallback selected the agent."),
      raw: json
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(input: RouterInput, verdict: RouterVerdict, candidates: AgentName[]): string {
  return JSON.stringify(
    {
      instruction: "Pick the best agent. Return {\"agent\":\"...\",\"reasoning\":\"one sentence\"}.",
      candidates,
      task: input.task,
      openFiles: input.openFiles ?? [],
      changedFiles: input.changedFiles ?? [],
      diffLines: input.diffLines ?? 0,
      phase1: {
        intentScores: verdict.intentScores,
        primaryIntent: verdict.intent,
        complexity: verdict.complexity,
        secondaryIntents: verdict.secondaryIntents,
        signals: verdict.signals
      }
    },
    null,
    2
  );
}

function parseJson(content: string): { agent?: string; reasoning?: string } | undefined {
  try {
    return JSON.parse(content) as { agent?: string; reasoning?: string };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as { agent?: string; reasoning?: string };
    } catch {
      return undefined;
    }
  }
}

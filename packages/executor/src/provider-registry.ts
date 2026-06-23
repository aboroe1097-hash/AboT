export interface ProviderConfig {
  id: string;
  type: "openai-compatible";
  baseUrl?: string;
  apiKeyEnv?: string;
  requiresApiKey: boolean;
  defaultHeaders?: Record<string, string>;
  variantToBody?: (variant: string | undefined) => Record<string, unknown>;
}

export interface ResolvedProviderModel {
  provider: ProviderConfig;
  providerId: string;
  modelId: string;
}

export function resolveProviderModel(model: string): ResolvedProviderModel {
  const slashIndex = model.indexOf("/");
  const providerId = slashIndex === -1 ? "openai" : model.slice(0, slashIndex);
  const rawModelId = slashIndex === -1 ? model : model.slice(slashIndex + 1);
  const provider = getProviderConfig(providerId);

  if (!provider) {
    throw new Error(`Unknown execution provider: ${providerId}`);
  }

  return {
    provider,
    providerId,
    modelId: rawModelId
  };
}

function getProviderConfig(providerId: string): ProviderConfig | undefined {
  switch (providerId) {
    case "openai":
      return {
        id: "openai",
        type: "openai-compatible",
        baseUrl: process.env.OPENAI_API_BASE ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        requiresApiKey: true,
        variantToBody: openAiVariantToBody
      };
    case "google":
    case "gemini":
      return {
        id: "google",
        type: "openai-compatible",
        baseUrl: process.env.GEMINI_OPENAI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKeyEnv: "GEMINI_API_KEY",
        requiresApiKey: true
      };
    case "openrouter":
      return {
        id: "openrouter",
        type: "openai-compatible",
        baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        apiKeyEnv: "OPENROUTER_API_KEY",
        requiresApiKey: true,
        defaultHeaders: {
          "HTTP-Referer": process.env.ABOT_REFERER ?? "https://github.com/aboroe1097-hash/AboT",
          "X-Title": "AboT"
        }
      };
    case "opencode-go":
      return {
        id: "opencode-go",
        type: "openai-compatible",
        baseUrl: process.env.OPENCODE_GO_BASE_URL,
        apiKeyEnv: "OPENCODE_GO_API_KEY",
        requiresApiKey: false
      };
    default:
      return undefined;
  }
}

function openAiVariantToBody(variant: string | undefined): Record<string, unknown> {
  switch (variant) {
    case "medium":
      return { reasoning_effort: "medium" };
    case "high":
    case "max":
    case "xhigh":
      return { reasoning_effort: "high" };
    default:
      return {};
  }
}

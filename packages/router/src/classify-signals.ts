import type { AgentName, Complexity, RouterInput, RouterIntent, RouterPhase, RouterVerdict, TaskScope } from "./types.js";

const PHASE1_THRESHOLD = 0.75;
const AMBIGUITY_MARGIN = 0.15;

const INTENTS: RouterIntent[] = [
  "css_design",
  "code_impl",
  "qa_review",
  "planning",
  "research",
  "debugging",
  "multimodal",
  "writing"
];

const MULTI_INTENT_MARKERS = [
  "and also",
  "additionally",
  "plus",
  "while you're at it",
  "also",
  "as well as",
  "furthermore",
  "moreover"
];

const HIGH_COMPLEXITY_MARKERS = [
  "entire",
  "whole",
  "rewrite",
  "redesign",
  "from scratch",
  "comprehensive",
  "complete",
  "full",
  "all files",
  "migrate"
];

const INTENT_PRIORITY: RouterIntent[] = [
  "debugging",
  "qa_review",
  "code_impl",
  "css_design",
  "planning",
  "multimodal",
  "writing",
  "research"
];

const KEYWORD_MAP: Record<RouterIntent, Array<[string, number]>> = {
  css_design: [
    ["style", 0.7],
    ["layout", 0.8],
    ["css", 0.9],
    ["tailwind", 0.9],
    ["animation", 0.8],
    ["responsive", 0.7],
    ["flex", 0.6],
    ["grid", 0.6],
    ["color", 0.5],
    ["theme", 0.7],
    ["dark mode", 0.8],
    ["padding", 0.7],
    ["margin", 0.7],
    ["font", 0.6],
    ["spacing", 0.7],
    ["border", 0.6],
    ["hover", 0.7],
    ["transition", 0.7],
    ["z-index", 0.8]
  ],
  code_impl: [
    ["implement", 0.9],
    ["build", 0.8],
    ["create a", 0.7],
    ["add a", 0.6],
    ["write a function", 0.8],
    ["rewrite", 0.9],
    ["refactor", 0.9],
    ["migrate", 0.8],
    ["from scratch", 0.8],
    ["convert", 0.7],
    ["extract", 0.7],
    ["optimize", 0.6],
    ["add support for", 0.8],
    ["integrate", 0.8],
    ["wire up", 0.8]
  ],
  qa_review: [
    ["review", 0.8],
    ["audit", 0.9],
    ["lint", 0.9],
    ["coverage", 0.7],
    ["test", 0.6],
    ["verify", 0.7],
    ["validate", 0.7],
    ["what's wrong with", 0.8],
    ["code smell", 0.9]
  ],
  planning: [
    ["plan", 0.8],
    ["outline", 0.8],
    ["architecture", 0.8],
    ["design doc", 0.9],
    ["roadmap", 0.8],
    ["strategy", 0.7],
    ["how should i", 0.6],
    ["what's the best way to", 0.7]
  ],
  research: [
    ["explain", 0.7],
    ["summarize", 0.7],
    ["research", 0.8],
    ["find", 0.5],
    ["look up", 0.7],
    ["what is", 0.6],
    ["how does", 0.6],
    ["docs", 0.5],
    ["documentation", 0.7]
  ],
  debugging: [
    ["fix", 0.8],
    ["debug", 0.9],
    ["error", 0.7],
    ["broken", 0.8],
    ["crash", 0.9],
    ["bug", 0.8],
    ["issue", 0.5],
    ["regression", 0.9],
    ["stack trace", 0.9],
    ["not working", 0.7],
    ["undefined", 0.6],
    ["null pointer", 0.8],
    ["type error", 0.7]
  ],
  multimodal: [
    ["screenshot", 0.9],
    ["image", 0.7],
    ["diagram", 0.8],
    ["visual", 0.6],
    ["mockup", 0.9],
    ["wireframe", 0.9],
    ["look at this", 0.7],
    ["what do you see", 0.8]
  ],
  writing: [
    ["write", 0.5],
    ["draft", 0.8],
    ["readme", 0.9],
    ["comment", 0.6],
    ["docstring", 0.8],
    ["javadoc", 0.9],
    ["documentation for", 0.8]
  ]
};

const FILE_PATTERN_MAP: Array<[RegExp, RouterIntent, number, string]> = [
  [/\.(module\.)?css$/i, "css_design", 1, "files:css"],
  [/\.(scss|sass|less)$/i, "css_design", 1, "files:css"],
  [/\.styled\.(ts|tsx|js|jsx)$/i, "css_design", 0.9, "files:styled-component"],
  [/\.svg$/i, "css_design", 0.8, "files:svg"],
  [/\.(spec|test)\.(ts|tsx|js|jsx|py|go)$/i, "qa_review", 1, "files:test"],
  [/_test\.go$/i, "qa_review", 1, "files:test"],
  [/\.(png|jpg|jpeg|webp|gif)$/i, "multimodal", 1, "files:image"],
  [/\.(md|mdx|rst)$/i, "writing", 0.6, "files:docs"],
  [/\.txt$/i, "writing", 0.5, "files:text"],
  [/\.(toml|ya?ml)$/i, "code_impl", 0.5, "files:config"],
  [/\.json$/i, "code_impl", 0.4, "files:json"],
  [/\.(ts|tsx|js|jsx|py|go|rs|java|cs)$/i, "code_impl", 0.5, "files:code"]
];

export function classifySignals(input: RouterInput): RouterVerdict {
  const task = input.task.trim();
  const lowerTask = task.toLowerCase();
  const files = [...(input.openFiles ?? []), ...(input.changedFiles ?? [])];
  const signals: string[] = [];

  const keywordScores = scoreKeywords(lowerTask, signals);
  const fileScores = scoreFiles(files, signals);
  const intentScores = combineScores(keywordScores, fileScores);
  const ranked = rankIntents(intentScores);
  const hasExplicitMultiIntent = MULTI_INTENT_MARKERS.some((marker) => lowerTask.includes(marker));
  const secondaryCandidates = ranked
    .slice(1)
    .filter((entry) => entry.score >= 0.55 || ranked[0]?.score - entry.score <= AMBIGUITY_MARGIN)
    .map((entry) => entry.intent);
  const hasMultipleIntentSignals = hasExplicitMultiIntent || secondaryCandidates.length > 0;
  const primary = pickPrimaryIntent(ranked, hasMultipleIntentSignals);
  const secondaryIntents = ranked
    .filter((entry) => entry.intent !== primary)
    .filter((entry) => entry.score >= 0.55 || ranked[0]?.score - entry.score <= AMBIGUITY_MARGIN)
    .map((entry) => entry.intent);
  const multiIntent = hasExplicitMultiIntent || secondaryIntents.length > 0;
  const topScore = Number((ranked.find((entry) => entry.intent === primary)?.score ?? 0).toFixed(2));
  const runnerUpScore = Number((ranked.find((entry) => entry.intent !== primary)?.score ?? 0).toFixed(2));

  if (hasExplicitMultiIntent) signals.push("task:multi-intent-marker");
  if (multiIntent) signals.push(`task:secondary-intents:${secondaryIntents.join(",")}`);

  const complexity = inferComplexity(lowerTask, files.length, input.diffLines ?? 0, multiIntent, signals);
  const scope = inferScope(primary);
  const suggestedAgent = suggestAgent(primary, complexity);
  const candidateAgents = buildCandidateAgents(ranked, complexity);
  const phase = getPhase(topScore, runnerUpScore, multiIntent);

  return {
    phase,
    intent: primary,
    complexity,
    scope,
    confidence: topScore,
    deterministicScore: topScore,
    suggestedAgent,
    candidateAgents,
    intentScores: Object.fromEntries(ranked.map((entry) => [entry.intent, Number(entry.score.toFixed(2))])),
    secondaryIntents,
    multiIntent,
    signals,
    reason: buildReason(phase, primary, complexity, topScore, runnerUpScore, files.length, input.diffLines ?? 0)
  };
}

function scoreKeywords(task: string, signals: string[]): Record<RouterIntent, number> {
  const scores = createEmptyScores();

  for (const intent of INTENTS) {
    for (const [keyword, weight] of KEYWORD_MAP[intent]) {
      if (containsKeyword(task, keyword)) {
        const previous = scores[intent];
        scores[intent] = previous === 0 ? weight : Math.min(1, Math.max(previous, weight) + 0.05);
        signals.push(`keyword:${intent}:${keyword}`);
      }
    }
  }

  if (Object.values(scores).every((score) => score === 0)) {
    signals.push("task:unspecified");
  }

  return scores;
}

function scoreFiles(files: string[], signals: string[]): Record<RouterIntent, number> {
  const scores = createEmptyScores();
  const matchedSignals = new Set<string>();

  for (const file of files) {
    for (const [pattern, intent, weight, signal] of FILE_PATTERN_MAP) {
      if (pattern.test(file)) {
        scores[intent] = Math.max(scores[intent], weight);
        matchedSignals.add(signal);
      }
    }
  }

  for (const signal of matchedSignals) {
    signals.push(signal);
  }

  return scores;
}

function combineScores(
  keywordScores: Record<RouterIntent, number>,
  fileScores: Record<RouterIntent, number>
): Record<RouterIntent, number> {
  const scores = createEmptyScores();

  for (const intent of INTENTS) {
    const keyword = keywordScores[intent];
    const file = fileScores[intent];

    if (keyword > 0 && file > 0) {
      scores[intent] = Math.max(keyword, file, file * 0.4 + keyword * 0.6);
    } else if (keyword > 0) {
      scores[intent] = keyword;
    } else if (file > 0) {
      scores[intent] = file;
    }
  }

  if (Object.values(scores).every((score) => score === 0)) {
    scores.code_impl = 0.35;
  }

  return scores;
}

function rankIntents(scores: Record<RouterIntent, number>): Array<{ intent: RouterIntent; score: number }> {
  return INTENTS.map((intent) => ({ intent, score: scores[intent] })).sort((a, b) => b.score - a.score);
}

function pickPrimaryIntent(ranked: Array<{ intent: RouterIntent; score: number }>, multiIntent: boolean): RouterIntent {
  if (!multiIntent) return ranked[0]?.intent ?? "code_impl";

  const topScore = ranked[0]?.score ?? 0;
  const viable = ranked.filter((entry) => entry.score >= 0.55 || topScore - entry.score <= 0.2).map((entry) => entry.intent);
  return INTENT_PRIORITY.find((intent) => viable.includes(intent)) ?? ranked[0]?.intent ?? "code_impl";
}

function inferComplexity(task: string, fileCount: number, diffLines: number, multiIntent: boolean, signals: string[]): Complexity {
  let score = 0;
  const wordCount = task.split(/\s+/).filter(Boolean).length;

  if (wordCount > 100) score += 2;
  else if (wordCount > 40) score += 1;

  if (fileCount > 5) score += 2;
  else if (fileCount > 2) score += 1;

  if (diffLines > 200) score += 2;
  else if (diffLines > 50) score += 1;

  if (multiIntent) score += 1;
  score += Math.min(3, HIGH_COMPLEXITY_MARKERS.filter((marker) => task.includes(marker)).length);

  if (score >= 5) {
    signals.push("complexity:ultra");
    return "ultra";
  }

  if (score >= 3) {
    signals.push("complexity:high");
    return "high";
  }

  if (score >= 1) {
    signals.push("complexity:medium");
    return "medium";
  }

  signals.push("complexity:low");
  return "low";
}

function inferScope(intent: RouterIntent): TaskScope {
  if (intent === "qa_review") return "review";
  if (intent === "planning" || intent === "research") return "planning";
  return "execution";
}

function suggestAgent(intent: RouterIntent, complexity: Complexity): AgentName {
  const table: Record<RouterIntent, Record<Complexity, AgentName>> = {
    css_design: {
      low: "visual-engineering",
      medium: "visual-engineering",
      high: "visual-engineering",
      ultra: "visual-engineering"
    },
    code_impl: {
      low: "atlas",
      medium: "sisyphus-junior",
      high: "hephaestus",
      ultra: "sisyphus"
    },
    qa_review: {
      low: "atlas",
      medium: "atlas",
      high: "momus",
      ultra: "momus"
    },
    planning: {
      low: "librarian",
      medium: "oracle",
      high: "metis",
      ultra: "oracle"
    },
    research: {
      low: "explore",
      medium: "librarian",
      high: "librarian",
      ultra: "librarian"
    },
    debugging: {
      low: "prometheus",
      medium: "prometheus",
      high: "hephaestus",
      ultra: "sisyphus"
    },
    multimodal: {
      low: "multimodal-looker",
      medium: "multimodal-looker",
      high: "multimodal-looker",
      ultra: "multimodal-looker"
    },
    writing: {
      low: "quick",
      medium: "quick",
      high: "writing",
      ultra: "writing"
    }
  };

  return table[intent][complexity];
}

function buildCandidateAgents(ranked: Array<{ intent: RouterIntent; score: number }>, complexity: Complexity): AgentName[] {
  const agents = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, 3)
    .map((entry) => suggestAgent(entry.intent, complexity));

  return [...new Set(agents)];
}

function getPhase(topScore: number, runnerUpScore: number, multiIntent: boolean): RouterPhase {
  if (topScore < PHASE1_THRESHOLD) return "llm_fallback_needed";
  if (runnerUpScore > 0 && topScore - runnerUpScore <= AMBIGUITY_MARGIN && !multiIntent) return "llm_fallback_needed";
  return "deterministic";
}

function buildReason(
  phase: RouterPhase,
  intent: RouterIntent,
  complexity: Complexity,
  topScore: number,
  runnerUpScore: number,
  fileCount: number,
  diffLines: number
): string {
  return `${phase}: ${intent}/${complexity}; score=${topScore}; runnerUp=${runnerUpScore}; files=${fileCount}; diffLines=${diffLines}`;
}

function containsKeyword(task: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i");
  return pattern.test(task);
}

function createEmptyScores(): Record<RouterIntent, number> {
  return {
    css_design: 0,
    code_impl: 0,
    qa_review: 0,
    planning: 0,
    research: 0,
    debugging: 0,
    multimodal: 0,
    writing: 0
  };
}

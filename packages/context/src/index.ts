export interface ContextCandidate {
  path: string;
  content?: string;
  source: "open" | "changed" | "mentioned" | "memory" | "discovered";
}

export interface ScoredContextCandidate extends ContextCandidate {
  score: number;
  reasons: string[];
}

export function scoreContextCandidates(task: string, candidates: ContextCandidate[]): ScoredContextCandidate[] {
  const lowerTask = task.toLowerCase();

  return candidates
    .map((candidate) => {
      const reasons: string[] = [];
      let score = candidate.source === "mentioned" ? 100 : 10;

      const fileName = candidate.path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
      if (fileName && lowerTask.includes(fileName)) {
        score += 50;
        reasons.push("filename-mentioned");
      }

      if (candidate.source === "changed") {
        score += 25;
        reasons.push("changed-file");
      }

      if (candidate.source === "open") {
        score += 10;
        reasons.push("open-file");
      }

      return { ...candidate, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function estimateTokenCount(text: string): number {
  // v0.01 budget warnings use a rough English/code heuristic until providers return actual usage.
  return Math.ceil(text.length / 3.5);
}

export function estimateContextTokens(candidates: ContextCandidate[]): number {
  return candidates.reduce((sum, candidate) => sum + estimateTokenCount(candidate.content ?? candidate.path), 0);
}

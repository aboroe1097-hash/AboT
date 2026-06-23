import { describe, expect, it } from "vitest";
import { estimateContextTokens, estimateTokenCount, scoreContextCandidates } from "./index.js";

describe("context scoring", () => {
  it("prioritizes mentioned and changed files", () => {
    const scored = scoreContextCandidates("fix src/auth.ts", [
      { path: "src/other.ts", source: "open" },
      { path: "src/auth.ts", source: "changed" },
      { path: "README.md", source: "mentioned" }
    ]);

    expect(scored[0].path).toBe("README.md");
    expect(scored[1].path).toBe("src/auth.ts");
    expect(scored[1].reasons).toEqual(expect.arrayContaining(["filename-mentioned", "changed-file"]));
  });

  it("estimates individual and aggregate token counts", () => {
    expect(estimateTokenCount("abcd")).toBe(2);
    expect(
      estimateContextTokens([
        { path: "a.ts", content: "abcdefg", source: "open" },
        { path: "b.ts", source: "changed" }
      ])
    ).toBe(4);
  });
});

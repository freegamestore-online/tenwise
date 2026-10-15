import { describe, expect, it } from "vitest";
import snapshot from "./trivia-snapshot.json";

const DIFFICULTIES = ["easy", "medium", "hard"];

describe("trivia snapshot attribution", () => {
  it("credits Open Trivia DB under CC BY-SA 4.0 with links", () => {
    expect(snapshot.attribution).toBe("Questions from Open Trivia DB, CC BY-SA 4.0");
    expect(snapshot.license).toBe("CC BY-SA 4.0");
    expect(snapshot.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(snapshot.sourceUrl).toBe("https://opentdb.com/");
  });
});

describe("trivia snapshot questions", () => {
  it("has questions", () => {
    expect(snapshot.questions.length).toBeGreaterThan(0);
  });

  it.each(snapshot.questions.map((q) => [q.id, q] as const))(
    "%s has a source, category, difficulty and exactly one correct answer",
    (_id, q) => {
      expect(q.source.trim()).not.toBe("");
      expect(q.category.trim()).not.toBe("");
      expect(DIFFICULTIES).toContain(q.difficulty);

      const options = [q.correct, ...q.incorrect];
      expect(options.filter((o) => o === q.correct)).toHaveLength(1);
      expect(new Set(options).size).toBe(options.length);
      expect(q.correct.trim()).not.toBe("");
    },
  );

  it("has unique ids", () => {
    const ids = snapshot.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no undecoded HTML entities or percent-encoding", () => {
    for (const q of snapshot.questions) {
      const text = [q.question, q.correct, ...q.incorrect].join(" ");
      expect(text).not.toMatch(/&(#\d+|#x[0-9a-f]+|[a-z]+);/i);
      expect(text).not.toMatch(/%[0-9A-F]{2}/);
    }
  });
});

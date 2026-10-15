import { describe, expect, it } from "vitest";

// The question bundle is part of the JS build, so the service worker precaches it and
// offline play needs no request. These checks keep the game code free of network calls.
const sources = import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("offline play", () => {
  it("reads its questions from the bundled snapshot, not the network", () => {
    expect(sources["./engine.ts"]).toContain('from "../data/trivia-snapshot.json"');
  });

  it("makes no network requests from the trivia code", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/\bfetch\s*\(/);
      expect(text, file).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon|WebSocket/);
    }
  });

  it("files daily scores locally, so a failed submit cannot break a round", () => {
    expect(sources["./TriviaView.tsx"]).toContain("submitDailyRound");
    expect(sources["./leaderboard.ts"]).not.toMatch(/await|Promise/);
  });
});

import { describe, expect, it } from "vitest";
import { memoryStore } from "../test/memoryStore";
import { maxRoundScore, ROUND_LENGTH, answer, currentQuestion, resumeGame, startGame, type GameState, type Result } from "./engine";
import { getLeaderboard, LEADERBOARD_KEY, submitDailyRound } from "./leaderboard";
import { loadDaily, saveDaily, DAILY_SAVE_PREFIX } from "./saves";
import { getStats, recordRound, STATS_KEY } from "./stats";
import { previousDate, isDateKey } from "./dates";
import { remainingMs } from "./timer";

/** Answer with the correct option, or a wrong one, and return the next state. */
function play(state: GameState, correct: boolean): GameState {
  const q = currentQuestion(state)!;
  return answer(state, correct ? q.correctIndex : (q.correctIndex + 1) % 4).state;
}

function finishDaily(date: string, correct: boolean): GameState {
  let state = startGame({ kind: "daily", date });
  for (let i = 0; i < ROUND_LENGTH; i++) state = play(state, correct);
  return state;
}

describe("resumeGame", () => {
  it("picks a saved daily round up at the next unanswered question", () => {
    const mode = { kind: "daily", date: "2026-10-16" } as const;
    const first = play(play(startGame(mode), true), false);
    const resumed = resumeGame(mode, first);

    expect(resumed.results).toEqual(first.results);
    expect(resumed.score).toBe(first.score);
    expect(resumed.streak).toBe(first.streak);
    expect(resumed.queue.map((q) => q.id)).toEqual(first.queue.map((q) => q.id));
  });

  it("gives back a finished daily round as finished", () => {
    const done = finishDaily("2026-10-16", true);
    const resumed = resumeGame(done.mode, done);
    expect(resumed.queue).toEqual([]);
  });
});

describe("daily saves", () => {
  it("round-trips progress under the date", () => {
    const store = memoryStore();
    const state = play(startGame({ kind: "daily", date: "2026-10-16" }), true);
    saveDaily("2026-10-16", state, store);
    const loaded = loadDaily("2026-10-16", store);
    expect(loaded?.results).toEqual(state.results);
    expect(loaded?.score).toBe(state.score);
  });

  it("returns null for a missing or malformed save", () => {
    const store = memoryStore();
    expect(loadDaily("2026-10-16", store)).toBeNull();
    store.setItem(DAILY_SAVE_PREFIX + "2026-10-16", JSON.stringify({ date: "2026-10-16", results: "bad" }));
    expect(loadDaily("2026-10-16", store)).toBeNull();
  });

  it("returns null when the stored date does not match its key", () => {
    const store = memoryStore();
    store.setItem(
      DAILY_SAVE_PREFIX + "2026-10-16",
      JSON.stringify({ date: "2026-10-15", results: [], streak: 0, bestStreak: 0, score: 0 }),
    );
    expect(loadDaily("2026-10-16", store)).toBeNull();
  });
});

describe("leaderboard", () => {
  it("files a finished daily round", () => {
    const store = memoryStore();
    const state = finishDaily("2026-10-16", true);
    expect(submitDailyRound(state, "Player", store)).toEqual({ ok: true });
    expect(getLeaderboard(store)).toEqual([{ date: "2026-10-16", playerName: "Player", score: state.score }]);
  });

  it("keeps only the higher score for a day", () => {
    const store = memoryStore();
    submitDailyRound(finishDaily("2026-10-16", false), "Player", store);
    const better = finishDaily("2026-10-16", true);
    submitDailyRound(better, "Player", store);
    expect(getLeaderboard(store)).toHaveLength(1);
    expect(getLeaderboard(store)[0]!.score).toBe(better.score);
  });

  it("rejects unfinished, non-daily and impossible rounds as Invalid game", () => {
    const store = memoryStore();
    const unfinished = play(startGame({ kind: "daily", date: "2026-10-16" }), true);
    expect(submitDailyRound(unfinished, "Player", store)).toEqual({ ok: false, reason: "Invalid game" });

    const survival = startGame({ kind: "survival", seed: "s" });
    expect(submitDailyRound(survival, "Player", store)).toEqual({ ok: false, reason: "Invalid game" });

    const tampered = { ...finishDaily("2026-10-16", true), score: maxRoundScore() + 1 };
    expect(submitDailyRound(tampered, "Player", store)).toEqual({ ok: false, reason: "Invalid game" });

    const mismatched = finishDaily("2026-10-16", true);
    const badResults: Result[] = mismatched.results.map((r) => ({ ...r, points: 0 }));
    expect(submitDailyRound({ ...mismatched, results: badResults }, "Player", store)).toEqual({
      ok: false,
      reason: "Invalid game",
    });
    expect(getLeaderboard(store)).toEqual([]);
  });

  it("drops malformed stored entries", () => {
    const store = memoryStore();
    store.setItem(LEADERBOARD_KEY, JSON.stringify([{ date: "nope" }, { date: "2026-10-16", playerName: "A", score: 5 }]));
    expect(getLeaderboard(store)).toEqual([{ date: "2026-10-16", playerName: "A", score: 5 }]);
  });
});

describe("stats", () => {
  it("counts rounds and bests", () => {
    const store = memoryStore();
    recordRound(finishDaily("2026-10-16", true), store);
    const stats = getStats(store);
    expect(stats.played).toBe(1);
    expect(stats.bestStreak).toBe(ROUND_LENGTH);
    expect(stats.bestScore).toBeGreaterThan(0);
  });

  it("builds a daily streak across consecutive UTC days and resets after a gap", () => {
    const store = memoryStore();
    recordRound(finishDaily("2026-10-14", true), store);
    expect(getStats(store).dailyStreak).toBe(1);
    recordRound(finishDaily("2026-10-15", true), store);
    expect(getStats(store).dailyStreak).toBe(2);
    recordRound(finishDaily("2026-10-17", true), store);
    expect(getStats(store).dailyStreak).toBe(1);
  });

  it("does not count practice toward the daily streak", () => {
    const store = memoryStore();
    recordRound(startGame({ kind: "survival", seed: "x" }), store);
    expect(getStats(store).lastDaily).toBeNull();
    expect(getStats(store).played).toBe(1);
  });

  it("falls back to empty stats for a malformed save", () => {
    const store = memoryStore();
    store.setItem(STATS_KEY, JSON.stringify({ played: "many" }));
    expect(getStats(store).played).toBe(0);
  });
});

describe("dates and timer", () => {
  it("steps back one UTC day across a month boundary", () => {
    expect(previousDate("2026-10-01")).toBe("2026-09-30");
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
  });

  it("validates date keys", () => {
    expect(isDateKey("2026-10-16")).toBe(true);
    expect(isDateKey("2026-13-99")).toBe(false);
    expect(isDateKey("16/10/2026")).toBe(false);
  });

  it("counts down and stops at zero", () => {
    expect(remainingMs(1000, 4000, 15000)).toBe(12000);
    expect(remainingMs(1000, 99999, 15000)).toBe(0);
  });
});

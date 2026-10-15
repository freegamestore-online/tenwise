import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  MAX_MULTIPLIER,
  ROUND_LENGTH,
  SURVIVAL_LIVES,
  answer,
  categories,
  currentQuestion,
  isOver,
  shareText,
  startGame,
  utcDate,
  type GameState,
} from "./engine";

/** Answer the current question correctly (or not) and return the next state. */
function play(state: GameState, correct: boolean): GameState {
  const q = currentQuestion(state);
  if (!q) throw new Error("no question");
  const choice = correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length;
  return answer(state, choice).state;
}

describe("daily round", () => {
  it("gives everyone the same ten questions on the same UTC day", () => {
    const a = startGame({ kind: "daily", date: "2026-10-16" });
    const b = startGame({ kind: "daily", date: "2026-10-16" });
    expect(a.queue).toHaveLength(ROUND_LENGTH);
    expect(a.queue).toEqual(b.queue);
  });

  it("changes on the next UTC day", () => {
    const today = startGame({ kind: "daily", date: "2026-10-16" });
    const tomorrow = startGame({ kind: "daily", date: "2026-10-17" });
    expect(tomorrow.queue.map((q) => q.id)).not.toEqual(today.queue.map((q) => q.id));
  });

  it("uses unique questions, each with exactly one correct option", () => {
    const { queue } = startGame({ kind: "daily", date: "2026-10-16" });
    expect(new Set(queue.map((q) => q.id)).size).toBe(ROUND_LENGTH);
    for (const q of queue) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBeDefined();
    }
  });

  it("ends after ten answers", () => {
    let state = startGame({ kind: "daily", date: "2026-10-16" });
    for (let i = 0; i < ROUND_LENGTH; i++) {
      expect(isOver(state)).toBe(false);
      state = play(state, true);
    }
    expect(isOver(state)).toBe(true);
    expect(currentQuestion(state)).toBeNull();
    expect(() => answer(state, 0)).toThrow("game is over");
  });

  it("derives the UTC date", () => {
    expect(utcDate(new Date("2026-10-16T23:30:00Z"))).toBe("2026-10-16");
  });
});

describe("category practice", () => {
  it("lists categories from the snapshot", () => {
    const names = categories();
    expect(names).toContain("History");
    expect([...names].sort()).toEqual(names);
  });

  it("draws only from the chosen category", () => {
    const state = startGame({ kind: "practice", category: "History", seed: "a" });
    expect(state.queue.length).toBeGreaterThan(0);
    expect(state.queue.every((q) => q.category === "History")).toBe(true);
  });

  it("gives up to ten questions and stops early on a small category", () => {
    const state = startGame({ kind: "practice", category: "History", seed: "a" });
    expect(state.queue.length).toBeLessThanOrEqual(ROUND_LENGTH);
  });

  it("returns an empty round for an unknown category", () => {
    const state = startGame({ kind: "practice", category: "Nope", seed: "a" });
    expect(state.queue).toEqual([]);
    expect(isOver(state)).toBe(true);
  });
});

describe("survival", () => {
  it("starts with three lives and a live question", () => {
    const state = startGame({ kind: "survival", seed: "s1" });
    expect(state.lives).toBe(SURVIVAL_LIVES);
    expect(currentQuestion(state)).not.toBeNull();
  });

  it("a wrong answer costs one life", () => {
    const start = startGame({ kind: "survival", seed: "s1" });
    const { state, outcome } = answer(start, (currentQuestion(start)!.correctIndex + 1) % 4);
    expect(outcome.correct).toBe(false);
    expect(outcome.livesLeft).toBe(SURVIVAL_LIVES - 1);
    expect(state.lives).toBe(SURVIVAL_LIVES - 1);
  });

  it("a correct answer keeps lives", () => {
    const start = startGame({ kind: "survival", seed: "s1" });
    const { state } = answer(start, currentQuestion(start)!.correctIndex);
    expect(state.lives).toBe(SURVIVAL_LIVES);
  });

  it("ends the game when lives reach zero", () => {
    let state = startGame({ kind: "survival", seed: "s1" });
    state = play(state, false);
    state = play(state, false);
    expect(isOver(state)).toBe(false);
    state = play(state, false);
    expect(state.lives).toBe(0);
    expect(isOver(state)).toBe(true);
    expect(currentQuestion(state)).toBeNull();
  });

  it("never runs out of questions while lives remain", () => {
    let state = startGame({ kind: "survival", seed: "long" });
    const total = 250; // more than the snapshot holds, so survival must refill
    for (let i = 0; i < total; i++) state = play(state, true);
    expect(isOver(state)).toBe(false);
    expect(state.results).toHaveLength(total);
    expect(state.batch).toBeGreaterThan(0);
  });
});

describe("streak multiplier", () => {
  it("builds on consecutive correct answers and caps", () => {
    let state = startGame({ kind: "survival", seed: "streak" });
    const multipliers: number[] = [];
    for (let i = 0; i < MAX_MULTIPLIER + 2; i++) {
      const { state: next, outcome } = answer(state, currentQuestion(state)!.correctIndex);
      multipliers.push(outcome.multiplier);
      state = next;
    }
    expect(multipliers).toEqual([1, 2, 3, 4, 4, 4]);
    expect(state.streak).toBe(MAX_MULTIPLIER + 2);
    expect(state.bestStreak).toBe(MAX_MULTIPLIER + 2);
  });

  it("scores base points times the multiplier", () => {
    let state = startGame({ kind: "daily", date: "2026-10-16" });
    state = play(state, true);
    state = play(state, true);
    expect(state.score).toBe(BASE_POINTS * 1 + BASE_POINTS * 2);
  });

  it("resets on a wrong answer and scores nothing for it", () => {
    let state = startGame({ kind: "survival", seed: "reset" });
    state = play(state, true);
    state = play(state, true);
    expect(state.streak).toBe(2);
    const { state: next, outcome } = answer(state, (currentQuestion(state)!.correctIndex + 1) % 4);
    expect(outcome.points).toBe(0);
    expect(next.streak).toBe(0);
    expect(next.bestStreak).toBe(2);
    const after = answer(next, currentQuestion(next)!.correctIndex).outcome;
    expect(after.multiplier).toBe(1);
  });
});

describe("share summary", () => {
  it("shows one emoji square per answer and no question text", () => {
    let state = startGame({ kind: "daily", date: "2026-10-16" });
    const questions = state.queue.map((q) => q.question);
    const pattern = [true, true, false, true, false, true, true, true, true, false];
    for (const correct of pattern) state = play(state, correct);

    const text = shareText(state);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Tenwise Daily 2026-10-16");
    expect(lines[1]).toContain("7/10");
    expect(lines[2]).toBe("🟩🟩🟥🟩🟥🟩🟩🟩🟩🟥");
    expect(lines).toHaveLength(3);
    for (const question of questions) expect(text).not.toContain(question);
  });

  it("names the practice category and wraps long survival runs to ten squares a line", () => {
    let practice = startGame({ kind: "practice", category: "History", seed: "x" });
    practice = play(practice, true);
    expect(shareText(practice).split("\n")[0]).toBe("Tenwise Practice: History");

    let survival = startGame({ kind: "survival", seed: "wrap" });
    for (let i = 0; i < 12; i++) survival = play(survival, true);
    const lines = shareText(survival).split("\n");
    expect(lines[0]).toBe("Tenwise Survival");
    expect(lines[1]).toContain("12 right of 12");
    expect(lines[2]).toBe("🟩".repeat(10));
    expect(lines[3]).toBe("🟩".repeat(2));
  });
});

import { defaultStore, readJson, writeJson, type KeyValueStore } from "../lib/storage";
import type { GameState } from "./engine";
import { previousDate } from "./dates";

export const STATS_KEY = "tenwise.stats";

/** Lifetime stats kept on this device. */
export interface Stats {
  played: number;
  bestScore: number;
  bestStreak: number;
  /** Consecutive UTC days with a finished daily round, ending on lastDaily. */
  dailyStreak: number;
  lastDaily: string | null;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  bestScore: 0,
  bestStreak: 0,
  dailyStreak: 0,
  lastDaily: null,
};

function isStats(value: unknown): value is Stats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.played === "number" &&
    typeof v.bestScore === "number" &&
    typeof v.bestStreak === "number" &&
    typeof v.dailyStreak === "number" &&
    (v.lastDaily === null || typeof v.lastDaily === "string")
  );
}

export function getStats(store: KeyValueStore | null = defaultStore()): Stats {
  const saved = readJson<unknown>(store, STATS_KEY);
  return isStats(saved) ? saved : EMPTY_STATS;
}

/** Folds a finished round into the stats. Call it once per round, when the last answer is in. */
export function recordRound(state: GameState, store: KeyValueStore | null = defaultStore()): Stats {
  const stats = getStats(store);
  const next: Stats = {
    ...stats,
    played: stats.played + 1,
    bestScore: Math.max(stats.bestScore, state.score),
    bestStreak: Math.max(stats.bestStreak, state.bestStreak),
  };

  if (state.mode.kind === "daily") {
    const date = state.mode.date;
    next.dailyStreak = stats.lastDaily === previousDate(date) ? stats.dailyStreak + 1 : 1;
    next.lastDaily = date;
  }

  writeJson(store, STATS_KEY, next);
  return next;
}

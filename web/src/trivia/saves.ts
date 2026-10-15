import { defaultStore, readJson, writeJson, type KeyValueStore } from "../lib/storage";
import type { Progress, Result } from "./engine";
import { isDateKey } from "./dates";

export const DAILY_SAVE_PREFIX = "tenwise.daily.";

/** Today's progress, keyed by UTC date. */
export interface DailySave extends Progress {
  date: string;
}

function isResult(value: unknown): value is Result {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.correct === "boolean" &&
    typeof v.multiplier === "number" &&
    typeof v.points === "number"
  );
}

function isSave(value: unknown): value is DailySave {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    isDateKey(v.date) &&
    Array.isArray(v.results) &&
    v.results.every(isResult) &&
    typeof v.streak === "number" &&
    typeof v.bestStreak === "number" &&
    typeof v.score === "number"
  );
}

/** Saves the daily round's progress under its UTC date. */
export function saveDaily(
  date: string,
  progress: Progress,
  store: KeyValueStore | null = defaultStore(),
): void {
  writeJson(store, DAILY_SAVE_PREFIX + date, { date, ...progress });
}

/** The saved daily progress for a date, or null if there is none or it is malformed. */
export function loadDaily(date: string, store: KeyValueStore | null = defaultStore()): DailySave | null {
  const saved = readJson<unknown>(store, DAILY_SAVE_PREFIX + date);
  return isSave(saved) && saved.date === date ? saved : null;
}

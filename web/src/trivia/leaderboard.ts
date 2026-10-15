import { defaultStore, readJson, writeJson, type KeyValueStore } from "../lib/storage";
import { maxRoundScore, ROUND_LENGTH, type GameState } from "./engine";
import { isDateKey } from "./dates";

export const LEADERBOARD_KEY = "tenwise.leaderboard";

/** One player's best daily score for one UTC day. */
export interface LeaderboardEntry {
  date: string;
  playerName: string;
  score: number;
}

export type SubmitResult = { ok: true } | { ok: false; reason: "Invalid game" };

function isEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    isDateKey(v.date) &&
    typeof v.playerName === "string" &&
    v.playerName.trim() !== "" &&
    typeof v.score === "number" &&
    Number.isInteger(v.score) &&
    v.score >= 0
  );
}

/** Stored entries. Malformed ones are dropped, and a malformed list reads as empty. */
function readEntries(store: KeyValueStore | null): LeaderboardEntry[] {
  const raw = readJson<unknown>(store, LEADERBOARD_KEY);
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

/**
 * Files a finished daily round. The round must be complete, its score must add up from its
 * answers, and it must be within what a round can score; anything else is "Invalid game".
 * A player has one entry per day, and a later, higher score replaces it.
 */
export function submitDailyRound(
  state: GameState,
  playerName: string,
  store: KeyValueStore | null = defaultStore(),
): SubmitResult {
  try {
    if (state.mode.kind !== "daily") return { ok: false, reason: "Invalid game" };
    const entry: LeaderboardEntry = { date: state.mode.date, playerName, score: state.score };
    const summed = state.results.reduce((total, r) => total + r.points, 0);
    if (
      state.results.length !== ROUND_LENGTH ||
      summed !== state.score ||
      state.score > maxRoundScore() ||
      !isEntry(entry)
    ) {
      return { ok: false, reason: "Invalid game" };
    }

    const entries = readEntries(store);
    const index = entries.findIndex((e) => e.date === entry.date && e.playerName === entry.playerName);
    if (index === -1) entries.push(entry);
    else if (entries[index]!.score < entry.score) entries[index] = entry;
    writeJson(store, LEADERBOARD_KEY, entries);
    return { ok: true };
  } catch {
    return { ok: false, reason: "Invalid game" };
  }
}

/** Every entry, highest score first. Equal scores put the newer date first. */
export function getLeaderboard(store: KeyValueStore | null = defaultStore()): LeaderboardEntry[] {
  return [...readEntries(store)].sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

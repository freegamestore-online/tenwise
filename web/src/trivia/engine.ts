import snapshot from "../data/trivia-snapshot.json";
import { hashSeed, mulberry32, shuffle } from "./rng";

export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: string;
  source: string;
  question: string;
  category: string;
  difficulty: Difficulty;
  correct: string;
  incorrect: string[];
}

/** A question as the player sees it: options already shuffled, correct one located. */
export interface RoundQuestion {
  id: string;
  question: string;
  category: string;
  difficulty: Difficulty;
  options: string[];
  correctIndex: number;
}

export type Mode =
  | { kind: "daily"; date: string }
  | { kind: "practice"; category: string; seed: string }
  | { kind: "survival"; seed: string };

export interface Result {
  id: string;
  correct: boolean;
  multiplier: number;
  points: number;
}

export interface GameState {
  mode: Mode;
  queue: RoundQuestion[];
  results: Result[];
  lives: number | null;
  streak: number;
  bestStreak: number;
  score: number;
  batch: number;
}

export interface Outcome {
  correct: boolean;
  correctIndex: number;
  multiplier: number;
  points: number;
  livesLeft: number | null;
}

export const ROUND_LENGTH = 10;
export const SURVIVAL_LIVES = 3;
export const BASE_POINTS = 100;
export const MAX_MULTIPLIER = 4;

const POOL: Question[] = [...(snapshot.questions as Question[])].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
);

/** Sorted, unique category names in the bundled snapshot. */
export function categories(): string[] {
  return [...new Set(POOL.map((q) => q.category))].sort();
}

/** UTC calendar date (YYYY-MM-DD), so the daily round changes at the same moment for everyone. */
export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Shuffle a pool with one seeded stream and fix each question's option order from that same stream. */
function prepare(questions: Question[], seed: string): RoundQuestion[] {
  const rand = mulberry32(hashSeed(seed));
  return shuffle(questions, rand).map((q) => {
    const options = shuffle([q.correct, ...q.incorrect], rand);
    return {
      id: q.id,
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      options,
      correctIndex: options.indexOf(q.correct),
    };
  });
}

function seedFor(mode: Mode): string {
  switch (mode.kind) {
    case "daily":
      return `daily:${mode.date}`;
    case "practice":
      return `practice:${mode.category}:${mode.seed}`;
    case "survival":
      return `survival:${mode.seed}`;
  }
}

/** Survival never runs out: when the queue empties, prepare the next shuffled batch of the whole pool. */
function refill(state: GameState): GameState {
  if (state.mode.kind !== "survival" || state.queue.length > 0) return state;
  const batch = state.batch + 1;
  return {
    ...state,
    batch,
    queue: prepare(POOL, `${seedFor(state.mode)}:${batch}`),
  };
}

export function startGame(mode: Mode): GameState {
  const base: GameState = {
    mode,
    queue: [],
    results: [],
    lives: mode.kind === "survival" ? SURVIVAL_LIVES : null,
    streak: 0,
    bestStreak: 0,
    score: 0,
    batch: 0,
  };

  if (mode.kind === "survival") return refill(base);

  const pool = mode.kind === "practice" ? POOL.filter((q) => q.category === mode.category) : POOL;
  return { ...base, queue: prepare(pool, seedFor(mode)).slice(0, ROUND_LENGTH) };
}

export function isOver(state: GameState): boolean {
  if (state.lives !== null) return state.lives <= 0;
  return state.results.length >= ROUND_LENGTH || state.queue.length === 0;
}

export function currentQuestion(state: GameState): RoundQuestion | null {
  return isOver(state) ? null : (state.queue[0] ?? null);
}

/**
 * Score the answer to the current question. A correct answer earns BASE_POINTS times the
 * multiplier, which is 1 + the streak before it (capped). A wrong answer resets the streak
 * and costs a life in survival mode.
 */
export function answer(state: GameState, choice: number): { state: GameState; outcome: Outcome } {
  const question = currentQuestion(state);
  if (!question) throw new Error("game is over");

  const correct = choice === question.correctIndex;
  const multiplier = correct ? Math.min(1 + state.streak, MAX_MULTIPLIER) : 1;
  const points = correct ? BASE_POINTS * multiplier : 0;
  const streak = correct ? state.streak + 1 : 0;
  const lives = state.lives === null ? null : correct ? state.lives : state.lives - 1;

  const next = refill({
    ...state,
    queue: state.queue.slice(1),
    results: [...state.results, { id: question.id, correct, multiplier, points }],
    lives,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    score: state.score + points,
  });

  return {
    state: next,
    outcome: {
      correct,
      correctIndex: question.correctIndex,
      multiplier,
      points,
      livesLeft: lives,
    },
  };
}

const SQUARES_PER_LINE = 10;

/**
 * Text summary with one emoji square per answer and no question content, so it is safe to
 * paste anywhere without spoiling the round.
 */
export function shareText(state: GameState): string {
  const { mode, results, score, bestStreak } = state;
  const squares = results.map((r) => (r.correct ? "🟩" : "🟥"));
  const rows: string[] = [];
  for (let i = 0; i < squares.length; i += SQUARES_PER_LINE) {
    rows.push(squares.slice(i, i + SQUARES_PER_LINE).join(""));
  }
  const correctCount = results.filter((r) => r.correct).length;

  let header: string;
  let stats: string;
  switch (mode.kind) {
    case "daily":
      header = `Tenwise Daily ${mode.date}`;
      stats = `${correctCount}/${ROUND_LENGTH} · ${score} pts · best streak ${bestStreak}`;
      break;
    case "practice":
      header = `Tenwise Practice: ${mode.category}`;
      stats = `${correctCount}/${ROUND_LENGTH} · ${score} pts · best streak ${bestStreak}`;
      break;
    case "survival":
      header = "Tenwise Survival";
      stats = `${correctCount} right of ${results.length} · ${score} pts · best streak ${bestStreak}`;
      break;
  }

  return [header, stats, ...rows].join("\n");
}

/** What a saved round keeps: enough to pick up where the player left off. */
export type Progress = Pick<GameState, "results" | "streak" | "bestStreak" | "score">;

/**
 * Picks a saved daily round back up: the same questions, minus the ones already answered.
 * Only for daily rounds, whose questions are fixed by the date.
 */
export function resumeGame(mode: Mode, progress: Progress): GameState {
  const fresh = startGame(mode);
  return {
    ...fresh,
    queue: fresh.queue.slice(progress.results.length),
    results: progress.results,
    streak: progress.streak,
    bestStreak: progress.bestStreak,
    score: progress.score,
  };
}

/** The most a round can score: ten correct answers at the capped multiplier. */
export function maxRoundScore(): number {
  let total = 0;
  for (let i = 0; i < ROUND_LENGTH; i++) total += BASE_POINTS * Math.min(1 + i, MAX_MULTIPLIER);
  return total;
}

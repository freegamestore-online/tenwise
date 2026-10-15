/** Seconds a player has per question when the timer is on. Off in relaxed mode. */
export const QUESTION_SECONDS = 15;

/** Milliseconds left on a question that started at `startedAt`, never below zero. */
export function remainingMs(startedAt: number, now: number, limitMs: number): number {
  return Math.max(0, limitMs - (now - startedAt));
}

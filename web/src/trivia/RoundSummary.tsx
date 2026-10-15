import { useEffect, useState } from "react";
import { GameButton, useGameSounds } from "@freegamestore/games";
import { Celebration } from "../feel/Celebration";
import { HAPTICS, vibrate } from "../feel/haptics";
import { prefersReducedMotion } from "../motion/reducedMotion";
import { shareText, type GameState } from "./engine";
import { getLeaderboard } from "./leaderboard";
import { getStats } from "./stats";

/** Correct answers at or above this get a celebration on the summary. */
const CELEBRATE_AT = 8;

interface RoundSummaryProps {
  state: GameState;
  filed: boolean;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function RoundSummary({ state, filed, onPlayAgain, onMenu }: RoundSummaryProps) {
  const [copied, setCopied] = useState(false);
  const [celebrating, setCelebrating] = useState(
    () => !prefersReducedMotion() && state.results.filter((r) => r.correct).length >= CELEBRATE_AT,
  );
  const { playGameOver } = useGameSounds();

  // The round ends once: one pulse and one sound when the summary appears.
  useEffect(() => {
    vibrate(HAPTICS.gameOver);
    playGameOver();
  }, []);

  const text = shareText(state);
  const correct = state.results.filter((r) => r.correct).length;
  const stats = getStats();
  const top = getLeaderboard().slice(0, 5);
  const title =
    state.mode.kind === "daily"
      ? `Daily ${state.mode.date}`
      : state.mode.kind === "practice"
        ? state.mode.category
        : "Survival";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-col items-center gap-4 text-center" aria-labelledby="round-title">
      {celebrating && (
        <Celebration id="round-end" label="Well played!" onDone={() => setCelebrating(false)} />
      )}
      <h2 id="round-title" className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
        {state.lives === 0 ? "Game over" : "Round complete"}
      </h2>
      <p style={{ color: "var(--muted)" }}>{title}</p>
      <p className="text-4xl font-bold" style={{ color: "var(--accent)" }}>
        {state.score} pts
      </p>
      <p style={{ color: "var(--muted)" }}>
        {correct} of {state.results.length} right · best streak {state.bestStreak}
        {state.mode.kind === "daily" && <> · daily streak {stats.dailyStreak}</>}
      </p>

      <pre
        className="whitespace-pre rounded-xl p-3 text-lg leading-relaxed"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
        aria-label="Shareable result"
      >
        {text}
      </pre>
      <GameButton variant="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy result"}
      </GameButton>

      {state.mode.kind === "daily" && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {filed ? "Saved to the leaderboard." : "This round is not on the leaderboard."}
        </p>
      )}
      {top.length > 0 && (
        <ol className="text-sm" style={{ color: "var(--muted)" }}>
          {top.map((e) => (
            <li key={`${e.date}-${e.playerName}`}>
              {e.date} · {e.playerName} · {e.score}
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-3">
        <GameButton onClick={onPlayAgain}>Play again</GameButton>
        <GameButton variant="ghost" onClick={onMenu}>
          Menu
        </GameButton>
      </div>
    </section>
  );
}

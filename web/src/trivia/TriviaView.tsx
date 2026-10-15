import { useCallback, useEffect, useRef, useState } from "react";
import { GameButton } from "@freegamestore/games";
import { HAPTICS, ParticleLayer, ScorePop, useHaptics, useShake, type ParticleLayerHandle } from "../feel";
import { useGameLoop } from "../hooks/useGameLoop";
import { prefersReducedMotion } from "../motion/reducedMotion";
import {
  answer,
  categories,
  currentQuestion,
  isOver,
  resumeGame,
  startGame,
  utcDate,
  type GameState,
  type Mode,
  type Outcome,
  type RoundQuestion,
} from "./engine";
import { QUESTION_SECONDS, remainingMs } from "./timer";
import { TimerRing } from "./TimerRing";
import { RoundSummary } from "./RoundSummary";
import { submitDailyRound } from "./leaderboard";
import { loadDaily, saveDaily } from "./saves";
import { getStats, recordRound } from "./stats";

/** The name daily scores are filed under until there is a sign-in name to use. */
const PLAYER_NAME = "Player";
const QUESTION_MS = QUESTION_SECONDS * 1000;
const PALETTE = ["#facc15", "#2563eb", "#16a34a", "#dc2626", "#9333ea"];

interface Setup {
  mode: Mode;
  relaxed: boolean;
}

/** Menu, then a round. Each start gets a fresh key, so "Play again" always remounts the round. */
export function TriviaView() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [round, setRound] = useState(0);

  if (!setup) {
    return <Menu onStart={(next) => { setRound((r) => r + 1); setSetup(next); }} />;
  }
  return (
    <Round
      key={round}
      mode={setup.mode}
      relaxed={setup.relaxed}
      onPlayAgain={() => setRound((r) => r + 1)}
      onMenu={() => setSetup(null)}
    />
  );
}

function Menu({ onStart }: { onStart: (setup: Setup) => void }) {
  const [relaxed, setRelaxed] = useState(false);
  const [category, setCategory] = useState(() => categories()[0] ?? "");
  const today = utcDate();
  const daily = loadDaily(today);
  const dailyDone = daily !== null && daily.results.length > 0;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h1 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
        Tenwise
      </h1>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        <input type="checkbox" checked={relaxed} onChange={(e) => setRelaxed(e.target.checked)} />
        Relaxed (no timer)
      </label>

      <GameButton block onClick={() => onStart({ mode: { kind: "daily", date: today }, relaxed })}>
        {dailyDone ? "Continue today's ten" : "Daily ten"}
      </GameButton>

      <div className="flex w-full gap-2">
        <select
          aria-label="Category"
          className="flex-1 rounded-full px-3 py-2"
          style={{ border: "1px solid var(--line-strong)", background: "var(--panel)", color: "var(--ink)" }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories().map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <GameButton variant="secondary" onClick={() => onStart({ mode: { kind: "practice", category, seed: String(Date.now()) }, relaxed })}>
          Practice
        </GameButton>
      </div>

      <GameButton variant="secondary" block onClick={() => onStart({ mode: { kind: "survival", seed: String(Date.now()) }, relaxed })}>
        Survival (3 lives)
      </GameButton>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {getStats().played} rounds played · best {getStats().bestScore} pts
      </p>
    </div>
  );
}

interface Reveal {
  question: RoundQuestion;
  choice: number;
  outcome: Outcome;
}

function initialGame(mode: Mode): GameState {
  if (mode.kind !== "daily") return startGame(mode);
  const saved = loadDaily(mode.date);
  return saved ? resumeGame(mode, saved) : startGame(mode);
}

function Round({ mode, relaxed, onPlayAgain, onMenu }: { mode: Mode; relaxed: boolean; onPlayAgain: () => void; onMenu: () => void }) {
  const [game, setGame] = useState<GameState>(() => initialGame(mode));
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [leftMs, setLeftMs] = useState(QUESTION_MS);
  const [filed, setFiled] = useState(false);
  const [pops, setPops] = useState<{ id: number; points: number }[]>([]);
  const nextId = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef<HTMLDivElement>(null);
  const particles = useRef<ParticleLayerHandle>(null);
  const haptics = useHaptics();
  const shake = useShake(answersRef);

  const over = isOver(game);
  const question = currentQuestion(game);
  const shown = reveal?.question ?? question;
  const timed = !relaxed;
  const ticking = timed && reveal === null && !over;

  const submit = useCallback(
    (choice: number) => {
      const current = currentQuestion(game);
      if (!current || reveal) return;

      const { state, outcome } = answer(game, choice);
      setGame(state);
      setReveal({ question: current, choice, outcome });
      if (mode.kind === "daily") saveDaily(mode.date, state);

      if (outcome.correct) {
        haptics.pulse(HAPTICS.clear);
        if (!prefersReducedMotion()) {
          const width = cardRef.current?.clientWidth ?? 0;
          const id = ++nextId.current;
          setPops((p) => [...p, { id, points: outcome.points }]);
          particles.current?.burst(width / 2, 80, PALETTE, { count: 40, speed: [200, 420], size: [4, 7], life: 1 });
        }
      } else {
        shake();
      }

      if (isOver(state)) {
        recordRound(state);
        if (mode.kind === "daily") setFiled(submitDailyRound(state, PLAYER_NAME).ok);
      }
    },
    [game, reveal, mode, haptics, shake],
  );

  // Timer: counts down while a question is open. Running out is a wrong answer.
  useGameLoop(() => {
    const ms = remainingMs(startedAt, performance.now(), QUESTION_MS);
    setLeftMs(ms);
    if (ms === 0) submit(-1);
  }, !ticking);

  function next() {
    setReveal(null);
    setStartedAt(performance.now());
    setLeftMs(QUESTION_MS);
  }

  // Keys: 1-4 pick an answer; Enter moves on after feedback.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && reveal) {
        e.preventDefault();
        next();
        return;
      }
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && shown && index < shown.options.length) submit(index);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (over && !reveal) {
    return <RoundSummary state={game} filed={filed} onPlayAgain={onPlayAgain} onMenu={onMenu} />;
  }

  const survival = game.lives !== null;
  const streakMultiplier = Math.min(1 + game.streak, 4);
  const questionNumber = game.results.length + (reveal ? 0 : 1);
  const total = mode.kind === "survival" ? null : game.results.length + game.queue.length;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex gap-4 font-semibold" style={{ color: "var(--muted)" }}>
        <span>Score {game.score}</span>
        <span>Streak ×{streakMultiplier}</span>
        {survival && <span>Lives {"♥".repeat(game.lives ?? 0) || "0"}</span>}
        <span>{total === null ? `Q${questionNumber}` : `${questionNumber}/${total}`}</span>
      </div>

      {timed && reveal === null && <TimerRing fraction={leftMs / QUESTION_MS} seconds={Math.ceil(leftMs / 1000)} />}

      {shown && (
        <div ref={cardRef} className="relative flex w-full flex-col gap-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {shown.category} · {shown.difficulty}
          </p>
          <h2 className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
            {shown.question}
          </h2>

          <div ref={answersRef} className="flex flex-col gap-3">
            {shown.options.map((option, i) => {
              const isCorrect = reveal !== null && i === shown.correctIndex;
              const isWrong = reveal !== null && i === reveal.choice && !isCorrect;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={reveal !== null}
                  onClick={() => submit(i)}
                  className="min-h-14 rounded-2xl px-4 py-3 text-left text-lg font-semibold"
                  style={{
                    border: "1px solid var(--line-strong)",
                    background: isCorrect ? "var(--success)" : isWrong ? "var(--error)" : "var(--panel)",
                    color: isCorrect || isWrong ? "#ffffff" : "var(--ink)",
                    boxShadow: isCorrect ? "0 0 0 4px rgba(34,197,94,0.35)" : undefined,
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <ParticleLayer ref={particles} />
          {pops.map((p) => (
            <ScorePop key={p.id} points={p.points} x={(cardRef.current?.clientWidth ?? 0) / 2} y={60} onDone={() => setPops((list) => list.filter((x) => x.id !== p.id))} />
          ))}
        </div>
      )}

      <p className="min-h-6 text-center font-semibold" aria-live="polite" style={{ color: "var(--accent)" }}>
        {reveal && feedback(reveal)}
      </p>

      {reveal && (
        <GameButton onClick={() => (over ? setReveal(null) : next())}>{over ? "See results" : "Next"}</GameButton>
      )}
    </div>
  );
}

function feedback({ outcome, choice, question }: Reveal): string {
  const answerText = question.options[question.correctIndex];
  if (outcome.correct) return `Correct! +${outcome.points}${outcome.multiplier > 1 ? ` (×${outcome.multiplier})` : ""}`;
  if (choice < 0) return `Time's up. The answer was ${answerText}`;
  return `Not quite. The answer was ${answerText}`;
}

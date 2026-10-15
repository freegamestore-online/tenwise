import { GameTopbar, GameThemeToggle, GameAuth } from "@freegamestore/games";
import GameShell from "./GameShell";
import { AboutContent } from "./AboutContent";
import { TriviaView } from "./trivia/TriviaView";

export default function App() {
  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Tenwise"
          actions={<GameThemeToggle />}
          about={<AboutContent />}
        />
      }
    >
      <GameAuth />
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-4">
        <TriviaView />
      </div>
    </GameShell>
  );
}

const LINK = "text-blue-600 underline dark:text-blue-400";

export function AboutContent() {
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h2 className="mb-1 text-base font-bold">About Tenwise</h2>
        <p>
          Tenwise is a daily trivia challenge. Answer ten questions from a bundled set
          of Open Trivia DB questions: one set per day in Daily Ten, unlimited practice
          by category, or an endless survival run to see how far you can go.
        </p>
      </section>
      <section>
        <h2 className="mb-1 text-base font-bold">Game Modes</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Daily Ten</strong>: one curated set per day, shared by all players.
          </li>
          <li>
            <strong>Category Practice</strong>: pick any category and drill as long as you like.
          </li>
          <li>
            <strong>Endless Survival</strong>: answer correctly to keep going. You have three
            lives; each wrong answer costs one.
          </li>
        </ul>
      </section>
      <section>
        <h2 className="mb-1 text-base font-bold">Attribution</h2>
        <p>
          Questions from{" "}
          <a href="https://opentdb.com/" target="_blank" rel="noopener noreferrer" className={LINK}>
            Open Trivia DB
          </a>
          , CC BY-SA 4.0. The question set in this game is shared under the same{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            CC BY-SA 4.0
          </a>{" "}
          licence.
        </p>
        <p className="mt-2">
          Source code is MIT-licensed. Attribution details are in the repository NOTICE file.
        </p>
      </section>
      <section>
        <p>
          Built for{" "}
          <a href="https://freegamestore.online" target="_blank" rel="noopener noreferrer" className={LINK}>
            freegamestore.online
          </a>
          , free forever.
        </p>
      </section>
    </div>
  );
}

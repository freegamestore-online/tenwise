// Builds src/data/trivia-snapshot.json from raw Open Trivia DB responses.
// Usage: node scripts/build-trivia-snapshot.mjs <rawDir>
// <rawDir> holds the api.php JSON files saved with encode=url3986. The game
// never calls the API at runtime; this script only runs by hand when the
// snapshot is refreshed. Questions from Open Trivia DB are CC BY-SA 4.0.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawDir = process.argv[2];
if (!rawDir) {
  console.error("usage: node scripts/build-trivia-snapshot.mjs <rawDir>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "../src/data/trivia-snapshot.json");

// Max questions kept per (category, difficulty) cell, so no category or
// difficulty dominates the pool.
const PER_CELL = 8;

// Words that mark a question as time-sensitive ("dated") rather than evergreen.
const DATED = /\b(current(ly)?|as of|this year|today|latest|recent(ly)?|right now)\b/i;

// Terms we will not ship, even though Open Trivia DB has few of them.
const OFFENSIVE = /\b(slur|nazi|rape|suicide|porn|genocide)\b/i;

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

/** Decode url3986 percent-encoding, then HTML entities. */
function decodeText(value) {
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    // Leave malformed sequences as-is; the filters below will catch junk.
  }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

const raw = [];
for (const file of readdirSync(rawDir).filter((f) => f.endsWith(".json")).sort()) {
  const body = JSON.parse(readFileSync(join(rawDir, file), "utf8"));
  if (body.response_code !== 0) continue;
  raw.push(...body.results);
}

const seen = new Set();
const cells = new Map();
const dropped = { duplicate: 0, dated: 0, offensive: 0, malformed: 0 };

for (const r of raw) {
  const question = decodeText(r.question);
  const correct = decodeText(r.correct_answer);
  const incorrect = r.incorrect_answers.map(decodeText);
  const category = decodeText(r.category);
  const difficulty = decodeText(r.difficulty);

  const options = [correct, ...incorrect];
  if (!question || options.some((o) => !o) || new Set(options).size !== options.length) {
    dropped.malformed++;
    continue;
  }
  if (seen.has(question.toLowerCase())) {
    dropped.duplicate++;
    continue;
  }
  seen.add(question.toLowerCase());
  if (DATED.test(question)) {
    dropped.dated++;
    continue;
  }
  if (OFFENSIVE.test([question, ...options].join(" "))) {
    dropped.offensive++;
    continue;
  }

  const key = `${category}|${difficulty}`;
  const cell = cells.get(key) ?? [];
  if (cell.length >= PER_CELL) continue;
  cell.push({ question, category, difficulty, correct, incorrect });
  cells.set(key, cell);
}

const questions = [...cells.values()].flat().map((q, i) => ({
  id: `otdb-${String(i + 1).padStart(3, "0")}`,
  source: "Open Trivia DB (https://opentdb.com/)",
  ...q,
}));

const snapshot = {
  attribution: "Questions from Open Trivia DB, CC BY-SA 4.0",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  source: "Open Trivia DB",
  sourceUrl: "https://opentdb.com/",
  generatedBy: "web/scripts/build-trivia-snapshot.mjs",
  rawResponses: readdirSync(rawDir).filter((f) => f.endsWith(".json")).length,
  rawQuestions: raw.length,
  dropped,
  questions,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`wrote ${questions.length} questions (from ${raw.length} raw) to ${outFile}`);
console.log("dropped:", dropped);

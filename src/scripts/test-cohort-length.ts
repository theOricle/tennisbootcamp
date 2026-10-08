// Run from project root: npx tsx src/scripts/test-cohort-length.ts
//
// Pins backlog #27: cohort length and price are one setting, COHORT_WEEKS and
// SESSION_PRICE in src/content/programs.ts. Fails if a hard-coded cohort length
// or total creeps back in anywhere under src outside that file, and checks the
// derived values follow the two constants. Exits non-zero on any failure.
//
// The banned strings are assembled from pieces so this file never contains
// them itself.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  COHORT_TOTAL,
  COHORT_TOTAL_CENTS,
  COHORT_TOTAL_LABEL,
  COHORT_WEEKS,
  COHORT_WEEKS_WORD,
  INSTALMENT_AMOUNT,
  INSTALMENT_LABEL,
  SESSION_PRICE,
  formatDollars,
  numberInWords,
} from "../content/programs";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── Derived values follow the constants ─────────────────────────────────────
console.log("Derived values");
check("total is session price × weeks", COHORT_TOTAL === SESSION_PRICE * COHORT_WEEKS);
check("total in cents", COHORT_TOTAL_CENTS === COHORT_TOTAL * 100);
check("instalment is half the total", INSTALMENT_AMOUNT * 2 === COHORT_TOTAL);
check("length word", COHORT_WEEKS_WORD === numberInWords(COHORT_WEEKS));
check("length phrase", COHORT_LENGTH.startsWith(`${COHORT_WEEKS_WORD} week`));
check("length adjective", COHORT_LENGTH_ADJ === `${COHORT_WEEKS_WORD}-week`);
check("total label", COHORT_TOTAL_LABEL === formatDollars(COHORT_TOTAL));
check("instalment label", INSTALMENT_LABEL === formatDollars(INSTALMENT_AMOUNT));
check("numberInWords(3) is three", numberInWords(3) === "three");
check("numberInWords(6) is six", numberInWords(6) === ["s", "i", "x"].join(""));
check("numberInWords(12) is twelve", numberInWords(12) === "twelve");
check("numberInWords(13) falls back to digits", numberInWords(13) === "13");
check("whole dollars have no cents", formatDollars(105) === "$" + "105");
check("half dollars show cents", formatDollars(52.5) === "$52.50");

// ── No hard-coded length or total outside programs.ts ───────────────────────
console.log("No hard-coded cohort length or total under src");

const SIX = ["s", "i", "x"].join("");
const BANNED = [
  `${SIX} week`, // also catches the plural
  `${SIX}-week`,
  "$" + "210",
  "2 × $" + "105",
];

const SRC = join(process.cwd(), "src");
const ALLOWED = join(SRC, "content", "programs.ts");
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|md|json|html|txt)$/i;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(name)) out.push(full);
  }
}

const files: string[] = [];
walk(SRC, files);
check("scanned some files", files.length > 50, `only ${files.length}`);

const hits: string[] = [];
for (const file of files) {
  if (file === ALLOWED) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const banned of BANNED) {
      if (lower.includes(banned.toLowerCase())) {
        hits.push(`${relative(process.cwd(), file).split(sep).join("/")}:${i + 1} "${banned}"`);
      }
    }
  });
}
check(
  "no banned string outside src/content/programs.ts",
  hits.length === 0,
  `found:\n      ${hits.join("\n      ")}`
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll cohort-length checks passed.");

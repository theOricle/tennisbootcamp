// Run from project root: npx tsx src/scripts/test-locations-follow-ups.ts
//
// Pins backlog #100, three follow-ups to /locations (backlog #99):
//   1. a change the coach makes in admin shows on /locations at once: the
//      page is one of COHORT_PAGES, so every admin and payment action that
//      rebuilds /programs (revalidateCohortPages) rebuilds it too, and
//      nothing else about what refreshes changes;
//   2. test-locations.ts never reads the real database: it imports the
//      stand-in (stub-cohort-reads.ts) before anything else it loads, and run
//      with a database configured it sends that database no request;
//   3. each class day stays with its time and a block's dates stay on one
//      line: a line of class days breaks only at a comma, one box per time;
//      a box wider than its row (two days at one long time on a small phone)
//      wraps between its words, its last day kept with the time, so no line
//      pushes the page sideways; a block's dates never break (across a new
//      year included); and a row whose when lines do not fit beside the
//      group's name puts them on a line of their own under it instead of
//      squeezing the name.
// The page renders here with sample blocks through a stand-in database client
// (stub-cohort-reads.ts); their dates count from today, so they stay
// upcoming. Every check catches its own error, so each reports on its own.
// Exits non-zero on any failure. Never spells the cohort length or total.

// First: the page imports server-only modules, and reads Supabase through the stand-in.
import "./stub-server-only";
import { setCohortRows } from "./stub-cohort-reads";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { COHORT_TOTAL_CENTS, COHORT_WEEKS, programGroups } from "../content/programs";
import { COHORT_DETAIL_ROUTE, COHORT_PAGES, revalidateCohortPages } from "../lib/cohortRevalidate";
import { getPublicCohorts, type CohortRow } from "../lib/cohortsDb";
import { todayIso } from "../lib/cohortVisibility";
import { groupCards } from "../lib/groupBlocks";
import LocationsPage from "../app/locations/page";

let failed = 0;
function check(name: string, test: () => boolean, detail?: () => string) {
  let ok = false;
  let why = "";
  try {
    ok = test();
    if (!ok && detail) why = detail();
  } catch (err) {
    why = `threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${why ? ` — ${why}` : ""}`);
  }
}

const ROOT = process.cwd();
const nodeRequire = createRequire(join(ROOT, "package.json"));
/** A source file, its line endings normalised. */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const json = (v: unknown) => JSON.stringify(v);
const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The words a piece of markup shows, in order (no space is read before a comma). */
const words = (html: string) =>
  unescape(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([,.])/g, "$1")
    .trim();

/**
 * Where a browser may end a line inside this markup, as the runs of text it
 * cannot break: a space outside a whitespace-nowrap span is a break, and so
 * is the point after a dash (a line may break after "–" or "-"); inside a
 * whitespace-nowrap span there is none.
 */
function unbreakableRuns(html: string): string[] {
  const runs: string[] = [];
  const nowrap: boolean[] = [];
  let run = "";
  const end = () => {
    if (run.trim()) runs.push(run.trim());
    run = "";
  };
  for (const [token] of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<[^>]+>|[^<]+/g)) {
    if (token.startsWith("</")) {
      nowrap.pop();
    } else if (token.startsWith("<")) {
      if (!token.endsWith("/>")) nowrap.push(/\bwhitespace-nowrap\b/.test(token));
    } else {
      for (const ch of unescape(token)) {
        const kept = nowrap.some(Boolean);
        if (!kept && /\s/.test(ch)) {
          end();
          continue;
        }
        run += ch;
        if (!kept && (ch === "–" || ch === "-")) end();
      }
    }
  }
  end();
  return runs;
}

/** The inner markup of every element that opens with `open`, nested spans counted. */
function innerOf(html: string, open: string): string[] {
  const out: string[] = [];
  for (let at = html.indexOf(open); at !== -1; at = html.indexOf(open, at + open.length)) {
    const start = at + open.length;
    const tags = /<span\b[^>]*>|<\/span>/g;
    tags.lastIndex = start;
    let depth = 0;
    for (let m = tags.exec(html); m; m = tags.exec(html)) {
      if (m[0] !== "</span>") {
        depth++;
      } else if (depth > 0) {
        depth--;
      } else {
        out.push(html.slice(start, m.index));
        break;
      }
    }
  }
  return out;
}

const PART = '<span class="inline-block">';
type Part = { text: string; runs: string[] };

/**
 * A line of class days as its parts: each inline-block box (a browser breaks
 * the line only between boxes, and keeps a box whole wherever it fits), with
 * the runs it cannot break inside a box that is wider than its line. Null
 * when anything but a space sits between the boxes.
 */
function partsOf(line: string): Part[] | null {
  const boxes = innerOf(line, PART);
  let rest = line;
  for (const box of boxes) rest = rest.replace(`${PART}${box}</span>`, "");
  if (rest.replace(/<!--[\s\S]*?-->/g, "").trim() !== "") return null;
  return boxes.map((box) => ({ text: words(box), runs: unbreakableRuns(box) }));
}

/** How many day names a piece of text holds ("Saturdays", "Wednesdays"). */
const daysIn = (s: string) => (s.match(/\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days\b/g) ?? []).length;
/** A class's time range: "12–1pm", "11am–12pm", "6:30–7:30pm". */
const TIME = /\d(?:am|pm)?–\d/;

type Row = { name: string; li: string; nameSpan: string; whenSpan: string; lines: string[] };

/** The rows under "What runs here": each group's name, its row's own tags, and its when lines as markup. */
function rowsOf(html: string): Row[] {
  const start = html.indexOf(">What runs here</h3>");
  if (start === -1) return [];
  const section = html.slice(start, html.indexOf(">Browse Programs<", start));
  return [...section.matchAll(/(<li class="[^"]*">)(<span class="[^"]*">)([\s\S]*?)<\/span>(<span class="[^"]*">)([\s\S]*?)<\/li>/g)].map(
    ([, li, nameSpan, name, whenSpan, rest]) => ({ name: unescape(name), li, nameSpan, whenSpan, lines: innerOf(rest, '<span class="block">') })
  );
}

const classesOf = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/);

// ─── Sample blocks (fictional), dated from today ────────────────────────────

const DAY = 86_400_000;
/** "YYYY-MM-DD", `days` after an ISO date. */
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** The first given weekday (0 Sunday … 6 Saturday) on or after an ISO date. */
function onOrAfter(iso: string, weekday: number): string {
  let day = iso;
  while (new Date(`${day}T12:00:00Z`).getUTCDay() !== weekday) day = addDays(day, 1);
  return day;
}
/**
 * The Saturday in the last week of a December (the 25th to the 31st) at
 * least three weeks from today in Toronto: a block that starts on it stays
 * upcoming and, from its second week, runs into the new year.
 */
function lateDecemberSaturday(): string {
  const soonest = addDays(todayIso(), 21);
  for (let year = Number(todayIso().slice(0, 4)); ; year++) {
    const saturday = onOrAfter(`${year}-12-25`, 6);
    if (saturday >= soonest) return saturday;
  }
}

/** A cohort row as the admin stores it: an Intermediate adult block, open and public, unless a test says otherwise. */
const row = (over: Partial<CohortRow> & Pick<CohortRow, "id">): CohortRow => ({
  program_id: "bootcamps",
  label: `Sample ${over.id}`,
  level_min: 3,
  level_max: 3.5,
  location_label: null,
  start_date: lateDecemberSaturday(),
  weeks: Math.max(2, COHORT_WEEKS),
  sessions: [{ day: "Sat", start: "12:00", end: "13:00" }],
  price_cents: COHORT_TOTAL_CENTS,
  currency: "CAD",
  capacity_min: 3,
  capacity_max: 8,
  visibility: "public",
  status: "inviting",
  invite_hold_hours: 48,
  makeup_max_weeks: 0,
  credit_followup: false,
  payment_mode: "etransfer",
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

/** Twice a week at two times, into a new year: "Saturdays 12–1pm, Wednesdays 6–7pm". */
const TWICE_A_WEEK = row({
  id: "int-twice",
  sessions: [
    { day: "Sat", start: "12:00", end: "13:00" },
    { day: "Wed", start: "18:00", end: "19:00" },
  ],
});
/** Two days at one time: "Sundays and Wednesdays 4–5pm". */
const SHARED_TIME = row({
  id: "beg-shared",
  level_min: 1,
  level_max: 1.5,
  start_date: onOrAfter(addDays(todayIso(), 21), 0),
  sessions: [
    { day: "Sun", start: "16:00", end: "17:00" },
    { day: "Wed", start: "16:00", end: "17:00" },
  ],
});
/**
 * Two days at one long time, wider than a 320px phone's row (about 290px
 * against 222px): "Wednesdays and Saturdays 11:30am–12:30pm". Kept as one
 * run, it pushed the page sideways (fix round, backlog #100).
 */
const LONG_SHARED_TIME = row({
  id: "adv-long",
  level_min: 4,
  level_max: 4.5,
  start_date: onOrAfter(addDays(todayIso(), 21), 3),
  sessions: [
    { day: "Wed", start: "11:30", end: "12:30" },
    { day: "Sat", start: "11:30", end: "12:30" },
  ],
});

/** Does a block's dates line run into a new year ("Dec 26, 2026 – Feb 3, 2027")? */
const crossesYear = (dates: string) => {
  const years = [...dates.matchAll(/\b(\d{4})\b/g)].map(([, y]) => y);
  return years.length === 2 && years[0] !== years[1];
};

// ─── 2. A run of test-locations with a database configured ──────────────────

/**
 * Run a test script with a database "configured": the Supabase URL points at
 * a local listener that records every request and answers with no rows.
 */
async function runWithADatabase(script: string): Promise<{ status: number | null; output: string; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[]");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
    SUPABASE_SERVICE_ROLE_KEY: "stand-in-not-a-key",
  };
  try {
    const result = await new Promise<{ status: number | null; output: string }>((resolve) => {
      const child = spawn(process.execPath, [nodeRequire.resolve("tsx/cli"), script], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      const timer = setTimeout(() => child.kill(), 120_000);
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, output });
      });
    });
    return { ...result, requests };
  } finally {
    server.close();
  }
}

async function main() {
  // ── 1. /locations is rebuilt with /programs ─────────────────────────────
  console.log("A change in admin shows on /locations at once, as on /programs");
  check("COHORT_PAGES includes /locations", () => (COHORT_PAGES as readonly string[]).includes("/locations"), () => json(COHORT_PAGES));
  check(
    "…beside the pages it already held, and nothing else: /, /programs and /locations; the program pages' route unchanged",
    () => json(COHORT_PAGES) === json(["/", "/programs", "/locations"]) && COHORT_DETAIL_ROUTE === "/programs/[slug]",
    () => `${json(COHORT_PAGES)} ${COHORT_DETAIL_ROUTE}`
  );
  {
    // Every admin and payment action rebuilds the public pages through
    // revalidateCohortPages (src/lib/cohortActions.ts). Watch what it marks.
    type Revalidate = (path: string, type?: "page" | "layout") => void;
    const cache = nodeRequire("next/cache") as { revalidatePath: Revalidate };
    const real = cache.revalidatePath;
    const marked: string[] = [];
    cache.revalidatePath = (path, type) => void marked.push(type ? `${path} (${type})` : path);
    try {
      revalidateCohortPages();
    } finally {
      cache.revalidatePath = real;
    }
    check(
      "revalidateCohortPages marks /locations stale with /programs, and no page it did not mark before",
      () => json(marked) === json(["/", "/programs", "/locations", "/programs/[slug] (page)"]),
      () => json(marked)
    );
  }

  // ── 2. test-locations never reads the real database ─────────────────────
  console.log("test-locations never reads the real database");
  const imports = [...read("src/scripts/test-locations.ts").matchAll(/^import\s[^;]*?["']([^"']+)["'];/gm)].map(([, from]) => from);
  check(
    "test-locations imports the stand-in right after the server-only stub, before anything else it loads, the page included",
    () =>
      imports[0] === "./stub-server-only" &&
      imports[1] === "./stub-cohort-reads" &&
      imports.indexOf("../app/locations/page") > 1 &&
      imports.filter((from) => from === "./stub-cohort-reads").length === 1,
    () => json(imports.slice(0, 3))
  );
  const run = await runWithADatabase("src/scripts/test-locations.ts");
  check(
    "run with a database configured, test-locations sends it no request, and passes",
    () => run.status === 0 && run.requests.length === 0,
    () => `exit ${run.status}, requests ${json(run.requests)}${run.status === 0 ? "" : `: ${run.output.slice(-600)}`}`
  );

  // ── 3. Each day with its time, the dates on one line ────────────────────
  console.log("Each class day stays with its time; a block's dates stay on one line");
  {
    setCohortRows([TWICE_A_WEEK, SHARED_TIME, LONG_SHARED_TIME]);
    const html = renderToStaticMarkup(await LocationsPage());
    const cards = groupCards(programGroups, await getPublicCohorts());
    const rows = rowsOf(html);
    const twice = cards.find((c) => c.block?.cohortId === "int-twice");
    const shared = cards.find((c) => c.block?.cohortId === "beg-shared");
    const longShared = cards.find((c) => c.block?.cohortId === "adv-long");
    const rowFor = (name: string | undefined) => rows.filter((r) => r.name === name);
    const [twiceRow] = rowFor(twice?.group.name);
    const [sharedRow] = rowFor(shared?.group.name);
    const [longSharedRow] = rowFor(longShared?.group.name);
    const [days, dates] = twiceRow?.lines ?? [];

    check(
      "the sample: a block twice a week at two times, into a new year, on the Intermediate Adult Bootcamp's one row",
      () =>
        twice?.block?.days === "Saturdays 12–1pm, Wednesdays 6–7pm" &&
        crossesYear(twice.block.dates) &&
        twice.group.name === "Intermediate Adult Bootcamp" &&
        rowFor(twice.group.name).length === 1,
      () => json({ days: twice?.block?.days, dates: twice?.block?.dates, rows: rows.map((r) => r.name) })
    );
    check(
      "its two-day line keeps each day with its time: one box per time, so it breaks only at the comma, each box its day and time as one run",
      () =>
        json(partsOf(days ?? "")) ===
        json([
          { text: "Saturdays 12–1pm,", runs: ["Saturdays 12–1pm,"] },
          { text: "Wednesdays 6–7pm", runs: ["Wednesdays 6–7pm"] },
        ]),
      () => `${json(partsOf(days ?? ""))} from ${days}`
    );
    check(
      "…and its dates across a new year never break: not inside a date, not at the dash",
      () => twice?.block !== undefined && twice.block !== null && json(unbreakableRuns(dates ?? "")) === json([twice.block.dates]),
      () => `${json(unbreakableRuns(dates ?? ""))} from ${dates}`
    );
    check(
      "…in the words of its card on /programs, unchanged",
      () => words(days ?? "") === twice?.block?.days && words(dates ?? "") === twice?.block?.dates,
      () => `${words(days ?? "")} | ${words(dates ?? "")}`
    );
    // Re-pinned in the fix round: a part was one unbreakable run, so a long
    // line of two days at one time could not wrap and pushed a 320px phone
    // sideways. A part is now a box that stays whole where it fits and wraps
    // between its words where it does not, its last day kept with the time.
    check(
      "two days at one time are one box: whole wherever it fits, and a long one wider than a small phone's row wraps only between its words, its last day kept with the time and the time whole",
      () =>
        shared?.block?.days === "Sundays and Wednesdays 4–5pm" &&
        json(partsOf(sharedRow?.lines[0] ?? "")) === json([{ text: "Sundays and Wednesdays 4–5pm", runs: ["Sundays", "and", "Wednesdays 4–5pm"] }]) &&
        longShared?.block?.days === "Wednesdays and Saturdays 11:30am–12:30pm" &&
        json(partsOf(longSharedRow?.lines[0] ?? "")) ===
          json([{ text: "Wednesdays and Saturdays 11:30am–12:30pm", runs: ["Wednesdays", "and", "Saturdays 11:30am–12:30pm"] }]),
      () => `${shared?.block?.days}: ${json(partsOf(sharedRow?.lines[0] ?? ""))}; ${longShared?.block?.days}: ${json(partsOf(longSharedRow?.lines[0] ?? ""))}`
    );
    check(
      "every row: one box per time, its last run its last day with the time, no run holding two days (a line never needs more room than one day and its time), and its dates (or Dates coming soon) on one line; By arrangement whole",
      () =>
        rows.length === cards.length &&
        rows.every((r) => {
          const [line, datesLine] = r.lines;
          const parts = partsOf(line ?? "");
          return (
            parts !== null &&
            parts.length > 0 &&
            parts.map((p) => p.text).join(" ") === words(line ?? "") &&
            parts.every((p) =>
              TIME.test(p.text)
                ? p.runs.every((run) => daysIn(run) <= 1) && /^\S+days \S*\d(?:am|pm)?–\d\S*$/.test(p.runs[p.runs.length - 1] ?? "")
                : p.runs.length === 1
            ) &&
            (datesLine === undefined ? r.lines.length === 1 : unbreakableRuns(datesLine).length === 1)
          );
        }),
      () => json(rows.map((r) => [r.name, partsOf(r.lines[0] ?? ""), r.lines[1] === undefined ? null : unbreakableRuns(r.lines[1])]))
    );
    check(
      "the row makes room instead of squeezing the name: the when lines take a line of their own under it once the name would be narrower than 7rem, at the right edge, never narrower than their longest run",
      () =>
        rows.length > 0 &&
        rows.every(
          (r) =>
            ["flex", "flex-wrap"].every((c) => classesOf(r.li).includes(c)) &&
            ["min-w-0", "grow", "basis-28"].every((c) => classesOf(r.nameSpan).includes(c)) &&
            ["ml-auto", "text-right"].every((c) => classesOf(r.whenSpan).includes(c)) &&
            !classesOf(r.whenSpan).includes("min-w-0")
        ),
      () => json([...new Set(rows.map((r) => `${r.li} ${r.nameSpan} ${r.whenSpan}`))])
    );
    check(
      "/locations keeps its own pieces: the shared TimesKeptWhole (the program pages' schedule line) is not used here",
      () => !read("src/app/locations/page.tsx").includes("TimesKeptWhole")
    );
  }

  // ── Wiring ──────────────────────────────────────────────────────────────
  console.log("Wiring");
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("npm test runs this file", () => pkg.scripts.test.includes("npx tsx src/scripts/test-locations-follow-ups.ts"));

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll locations follow-up checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

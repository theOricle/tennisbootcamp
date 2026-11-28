// Run from project root: npx tsx src/scripts/test-locations-right-day.ts
//
// Pins backlog #99: /locations never lists a group on a day it does not run.
// Each row under "What runs here" says what that group's card on /programs
// says about when it runs, from the same cards (groupCards,
// src/lib/groupBlocks.ts), the same reads (the public blocks and their
// seats) and the same revalidate:
//   1. an open block on another day than its planned group's: its row reads
//      the block's class days and times, then its dates, as its card writes
//      them, and the planned slot is gone;
//   2. no open block: every row reads as its card does (its own class, then
//      "Dates coming soon"; "By arrangement" for private lessons), and a read
//      that fails lists the same, never an error;
//   3. an open block that matches no planned group is listed under its
//      program, where /programs lists it; only the blocks /programs shows
//      (public, open, priced, not started) are listed, at their own location;
//   4. the search line names no weekday;
//   5. the page reads and rebuilds as /programs does, and the rows keep their
//      look: no new card, label or link.
// The page renders here with sample blocks through a stand-in database
// client (stub-cohort-reads.ts); their dates count from today, so they stay
// upcoming. Every check catches its own error, so each reports on its own.
// Exits non-zero on any failure. Never spells the cohort length or total.

// First: the page imports server-only modules, and reads Supabase through the stand-in.
import "./stub-server-only";
import { failCohortReads, setCohortRows } from "./stub-cohort-reads";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COHORT_TOTAL_CENTS, COHORT_WEEKS, listedPrograms, programGroups } from "../content/programs";
import { locations } from "../content/locations";
import { getPublicCohorts, type CohortRow } from "../lib/cohortsDb";
import { todayIso } from "../lib/cohortVisibility";
import { groupCards, type GroupCard } from "../lib/groupBlocks";
import { cardsAtLocation } from "../lib/locationCatalog";
import { formatBlockDates } from "../lib/programCatalog";
import { ArrangedGroupRow, ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import LocationsPage, { metadata, revalidate } from "../app/locations/page";

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
/** A source file, its line endings normalised. */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The words a piece of markup shows, in order (no space is read before a comma). */
const words = (html: string) =>
  unescape(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([,.])/g, "$1")
    .trim();
const WEEKDAY = /\b(mon|tues|wednes|thurs|fri|satur|sun)days?\b/i;
const CLUB = locations[0].id;
const INTERMEDIATE_ADULT = "Intermediate Adult Bootcamp";

// ─── Sample blocks (fictional), dated from today ────────────────────────────

const DAY = 86_400_000;
/** "YYYY-MM-DD", `days` after an ISO date. */
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** The first given weekday (0 Sunday … 6 Saturday) at least three weeks from today in Toronto, so a block stays upcoming. */
function upcoming(weekday: number): string {
  let iso = addDays(todayIso(), 21);
  while (new Date(`${iso}T12:00:00Z`).getUTCDay() !== weekday) iso = addDays(iso, 1);
  return iso;
}
const SATURDAY = upcoming(6);
const WEDNESDAY = upcoming(3);

/**
 * A cohort row as the admin stores it: an Intermediate adult block on
 * Saturdays 12–1pm (its planned group trains on Sundays 5–6pm), open and
 * public, unless a test says otherwise.
 */
const row = (over: Partial<CohortRow> & Pick<CohortRow, "id">): CohortRow => ({
  program_id: "bootcamps",
  label: `Sample ${over.id}`,
  level_min: 3,
  level_max: 3.5,
  location_label: null,
  start_date: SATURDAY,
  weeks: COHORT_WEEKS,
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

// ─── Reading the page and the cards ─────────────────────────────────────────

type Row = { program: string; name: string; lines: string[] };

/** The markup of "What runs here": from its heading to the club's Browse Programs link, which follows it. */
function whatRunsHere(html: string): string {
  const start = html.indexOf(">What runs here</h3>");
  if (start === -1) return "";
  return html.slice(start, html.lastIndexOf("<a ", html.indexOf(">Browse Programs<", start)));
}

/** "What runs here", row by row: the program it sits under, the group's name, and the lines beside it. */
function rowsOf(html: string): Row[] {
  return whatRunsHere(html)
    .split('href="/programs/')
    .slice(1)
    .flatMap((chunk) => {
      const program = chunk.slice(0, chunk.indexOf('"'));
      // Re-pinned for backlog #100: a row is a wrapping flex row, its name growing from a 7rem basis.
      return [...chunk.matchAll(/<li class="flex [^"]*">([\s\S]*?)<\/li>/g)].map(([, inner]) => {
        const name = /^<span class="min-w-0 grow basis-28 text-white\/90">([\s\S]*?)<\/span>/.exec(inner)?.[1] ?? "";
        const rest = inner.replace(/^<span class="min-w-0 grow basis-28 text-white\/90">[\s\S]*?<\/span>/, "");
        const lines = rest.split('<span class="block">').slice(1).map(words);
        return { program, name: unescape(name), lines: lines.length > 0 ? lines : [words(rest)] };
      });
    });
}

/**
 * What a card on /programs says about when its group runs, read off the
 * rendered card: its class days and times, then its dates (its four lines are
 * who, the dates, the class days and where). A group with no fixed class is a
 * row there that reads "By arrangement · {price}".
 */
function cardSays(card: GroupCard): string[] {
  if (card.group.day === null) {
    const html = render(createElement(ArrangedGroupRow, { group: card.group }));
    return [words(/<p class="mt-0\.5[^"]*">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "").split(" · ")[0]];
  }
  const html = render(createElement(ProgramGroupCard, { group: card.group, block: card.block }));
  const list = /<ul role="list" class="mb-4 mt-2[^"]*">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
  const [, dates, classDays] = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(([, inner]) => words(inner));
  return [classDays, dates];
}

/** The rows /locations should show: every card at the club, under its program in catalog order, as /programs lists them, saying what the card says. */
function rowsFor(cards: readonly GroupCard[]): Row[] {
  return listedPrograms.flatMap((p) =>
    cards
      .filter((c) => c.group.programSlug === p.slug && c.group.locationId === CLUB)
      .map((c) => ({ program: p.slug, name: c.group.name, lines: cardSays(c) }))
  );
}

/** The page, and the cards /programs builds, once the stand-in answers with these rows. */
async function state(sample: CohortRow[]) {
  setCohortRows(sample);
  const html = render(await LocationsPage());
  const cards = groupCards(programGroups, await getPublicCohorts());
  return { html, rows: rowsOf(html), cards };
}

const json = (v: unknown) => JSON.stringify(v);

async function main() {
  // ── 1. An open block on another day ─────────────────────────────────────
  console.log("An open block on another day than its planned group's: its own days, times and dates");
  {
    const sat = await state([row({ id: "int-sat" })]);
    const card = sat.cards.find((c) => c.block?.cohortId === "int-sat");
    const mine = sat.rows.filter((r) => r.name === INTERMEDIATE_ADULT);
    const dates = formatBlockDates(SATURDAY, addDays(SATURDAY, 7 * (COHORT_WEEKS - 1)));
    check(
      "the Intermediate Adult Bootcamp's one row reads the block's class days and times, then its dates",
      () => mine.length === 1 && json(mine[0].lines) === json(["Saturdays 12–1pm", dates]),
      () => json(mine)
    );
    check(
      "…exactly as its card on /programs writes them",
      () => card !== undefined && mine.length === 1 && json(mine[0].lines) === json(cardSays(card)),
      () => `${json(mine[0]?.lines)} vs ${card ? json(cardSays(card)) : "no card"}`
    );
    check(
      "…and the planned Sunday 5pm slot is gone from the page",
      () => !words(sat.html).includes("Sundays 5–6pm") && !words(sat.html).includes("5:00–6:00 pm")
    );
    check(
      "every row reads as its card on /programs, in the order /programs lists them",
      () => json(sat.rows) === json(rowsFor(sat.cards)),
      () => json(sat.rows)
    );
  }

  // ── 2. No open block, and a read that fails ─────────────────────────────
  console.log("No open block: every row reads as its card, and a failed read lists the same");
  {
    const none = await state([]);
    const expected = rowsFor(groupCards(programGroups, []));
    check(
      "every row reads as its card on /programs: a planned group's own class, then Dates coming soon; private lessons by arrangement",
      () => none.rows.length === programGroups.length && json(none.rows) === json(expected),
      () => json(none.rows)
    );
    check(
      "…the Intermediate Adult Bootcamp reads its planned class in the card's style, then Dates coming soon",
      () => none.rows.find((r) => r.name === INTERMEDIATE_ADULT)?.lines.join(" | ") === "Sundays 5–6pm | Dates coming soon",
      () => json(none.rows.find((r) => r.name === INTERMEDIATE_ADULT))
    );
    check(
      "…and One-to-one coaching reads By arrangement, and nothing else",
      () => json(none.rows.filter((r) => r.program === "private-lessons")) === json([{ program: "private-lessons", name: "One-to-one coaching", lines: ["By arrangement"] }]),
      () => json(none.rows.filter((r) => r.program === "private-lessons"))
    );
    for (const how of ["error", "throw"] as const) {
      const logged: string[] = [];
      const error = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
      let html = "";
      let threw = "";
      try {
        failCohortReads(how);
        html = render(await LocationsPage());
      } catch (err) {
        threw = err instanceof Error ? err.message : String(err);
      } finally {
        console.error = error;
      }
      check(
        `a blocks read that fails (${how === "error" ? "an error in the answer" : "a thrown error"}) still renders the page, every row as with no open block`,
        () => threw === "" && json(rowsOf(html)) === json(expected) && (how === "error" || logged.some((l) => l.includes("getAllCohorts failed"))),
        () => threw || json(rowsOf(html))
      );
    }
  }

  // ── 3. Off the lineup, two blocks of one group, and what is not listed ──
  console.log("An open block off the lineup, two blocks of one group, and only the blocks /programs shows");
  {
    const off = await state([
      row({ id: "int-youth-wed", program_id: "youth-programs", start_date: WEDNESDAY, sessions: [{ day: "Wed", start: "18:00", end: "19:00" }] }),
    ]);
    const youth = off.rows.filter((r) => r.program === "youth-programs");
    const card = off.cards.find((c) => c.block?.cohortId === "int-youth-wed");
    check(
      "an open block that matches no planned group is listed under its program, where /programs lists it (by level)",
      () => youth.map((r) => r.name).join(", ") === "Beginner Junior Bootcamp, Novice Youth Bootcamp, Intermediate Youth Bootcamp, High Performance Youth Bootcamp",
      () => youth.map((r) => r.name).join(", ")
    );
    check(
      "…with its own class days and dates, as its card writes them",
      () => card !== undefined && cardSays(card)[0] === "Wednesdays 6–7pm" && json(youth.find((r) => r.name === "Intermediate Youth Bootcamp")?.lines) === json(cardSays(card)),
      () => json(youth.find((r) => r.name === "Intermediate Youth Bootcamp"))
    );
    check("…and every row still reads as its card", () => json(off.rows) === json(rowsFor(off.cards)), () => json(off.rows));

    const two = await state([
      row({ id: "int-a" }),
      row({
        id: "int-b",
        start_date: addDays(SATURDAY, 7 * COHORT_WEEKS),
        sessions: [{ day: "Sat", start: "12:00", end: "13:00" }, { day: "Wed", start: "18:00", end: "19:00" }],
      }),
    ]);
    const blocks = two.rows.filter((r) => r.name === INTERMEDIATE_ADULT);
    check(
      "two open blocks of one group are two rows, the earliest first, each with its own days and dates, as /programs shows two cards",
      () =>
        blocks.length === 2 &&
        blocks[0].lines[0] === "Saturdays 12–1pm" &&
        blocks[1].lines[0] === "Saturdays 12–1pm, Wednesdays 6–7pm" &&
        blocks[0].lines[1] !== blocks[1].lines[1] &&
        json(two.rows) === json(rowsFor(two.cards)),
      () => json(blocks)
    );

    const hidden = await state([
      row({ id: "draft", status: "draft" }),
      row({ id: "private", visibility: "private" }),
      row({ id: "no-price", price_cents: 0 }),
      row({ id: "started", start_date: addDays(todayIso(), -14) }),
    ]);
    check(
      "a block /programs does not show (a draft, a private block, one with no price, one already started) is not listed: its group reads as its card with no open block",
      () =>
        hidden.cards.every((c) => c.block === null) &&
        hidden.rows.find((r) => r.name === INTERMEDIATE_ADULT)?.lines.join(" | ") === "Sundays 5–6pm | Dates coming soon" &&
        json(hidden.rows) === json(rowsFor(hidden.cards)),
      () => json(hidden.rows.find((r) => r.name === INTERMEDIATE_ADULT))
    );

    const open = off.cards.find((c) => c.block !== null);
    const elsewhere: GroupCard | null = open ? { ...open, group: { ...open.group, id: "elsewhere-card", locationId: "elsewhere" } } : null;
    check(
      "a card is listed at its own location only",
      () =>
        elsewhere !== null &&
        cardsAtLocation("elsewhere", off.cards).length === 0 &&
        !cardsAtLocation(CLUB, [...off.cards, elsewhere]).some((p) => p.cards.includes(elsewhere)) &&
        cardsAtLocation("elsewhere", [elsewhere])[0]?.cards[0] === elsewhere
    );
    const noted = await state([row({ id: "noted", location_label: "Newtonbrook, court 3" })]);
    check(
      "…and a block trains where its own note says, as its card reads it",
      () =>
        noted.cards.find((c) => c.block?.cohortId === "noted")?.group.locationId === CLUB &&
        noted.rows.filter((r) => r.name === INTERMEDIATE_ADULT).map((r) => r.lines[0]).join() === "Saturdays 12–1pm"
    );
  }

  // ── 4. The search line ──────────────────────────────────────────────────
  console.log("The search line names no weekday");
  {
    const description = String(metadata.description ?? "");
    check("the search line names no weekday", () => !WEEKDAY.test(description), () => description);
    check(
      "…it names the club, its area and what runs there, in 155 characters or fewer",
      () =>
        description === "Where we train in Toronto: Newtonbrook Tennis Club, North York. Youth Bootcamps and Adult Bootcamps by age and level, private lessons by arrangement." &&
        description.length <= 155,
      () => `${description.length}: ${description}`
    );
    check(
      "…and the check catches the old line",
      () => WEEKDAY.test("Where we train in Toronto: Newtonbrook Tennis Club, North York. Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, private lessons by arrangement.")
    );
  }

  // ── 5. The same reads and rebuild, and the rows' look ───────────────────
  console.log("The same reads and rebuild as /programs, and the rows keep their look");
  {
    const src = read("src/app/locations/page.tsx");
    const programsSrc = read("src/app/programs/page.tsx");
    const reads = [
      "const publicCohorts = await getPublicCohorts();",
      "const seats = await readBlockSeats(publicCohorts);",
      "groupCards(programGroups, publicCohorts, seats)",
    ];
    check("the page reads the public blocks and their seats as /programs does, and builds the same cards", () => reads.every((line) => src.includes(line) && programsSrc.includes(line)));
    check("…and rebuilds as often: revalidate 60, as /programs", () => revalidate === 60 && /export const revalidate = 60;/.test(src) && /export const revalidate = 60;/.test(programsSrc));
    check("no row reads the planned lineup's own times any more", () => !src.includes("formatGroupWhen") && !src.includes("programsAtLocation") && src.includes("cardsAtLocation(location.id, cards)"));

    const sat = await state([row({ id: "int-sat" })]);
    const section = whatRunsHere(sat.html);
    const count = (pattern: RegExp) => (section.match(pattern) ?? []).length;
    // Re-pinned for backlog #100: the row wraps its when lines under the name
    // when they do not fit beside it (test-locations-follow-ups.ts); the name,
    // the time and their colours and size are unchanged.
    check(
      "the rows keep their look: one row per group, its name and its time in their own classes",
      () =>
        sat.rows.length > 0 &&
        count(/<li class="flex flex-wrap items-start gap-x-4 gap-y-0\.5 py-2\.5 text-sm">/g) === sat.rows.length &&
        count(/<li[ >]/g) === sat.rows.length + listedPrograms.length &&
        count(/<span class="min-w-0 grow basis-28 text-white\/90">/g) === sat.rows.length &&
        count(/<span class="ml-auto text-right tabular-nums text-white\/70">/g) === sat.rows.length
    );
    check(
      "…its lines plain, in the time's own colour and size: no chip, no weight, no button, no new label",
      () =>
        (section.match(/<span [^>]*>/g) ?? []).every((t) =>
          ['<span class="min-w-0 grow basis-28 text-white/90">', '<span class="ml-auto text-right tabular-nums text-white/70">', '<span class="block">', '<span class="inline-block">', '<span class="whitespace-nowrap">', '<span aria-hidden="true">'].includes(t)
        ) && !/Open to join|Enroll|Notify me|Ask to join|By approval|spots? left|>Full</.test(section),
      () => [...new Set(section.match(/<span [^>]*>/g) ?? [])].join(" ")
    );
    check(
      "…no new card or link: one link per program, one title line per program, no card in the list",
      () => count(/<a /g) === listedPrograms.length && count(/<p /g) === listedPrograms.length && !section.includes("<article") && !/<h[2-6]/.test(section)
    );
  }

  // ── Wiring ──────────────────────────────────────────────────────────────
  console.log("Wiring");
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("npm test runs this file", () => pkg.scripts.test.includes("npx tsx src/scripts/test-locations-right-day.ts"));

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll locations-right-day checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

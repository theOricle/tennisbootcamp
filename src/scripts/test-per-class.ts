// Run from project root: npx tsx src/scripts/test-per-class.ts
//
// Pins backlog #86 (owner, 2026-11-17 and 2026-11-22: a visitor reads the
// whole price, and the per-class figure, worked out by the code from the
// block, shows quietly on the sign-up page of that block):
//   1. the figure: a block's own price over the classes it runs, counted as
//      its card counts them, so a cancelled class is not counted and its
//      make-up is not counted twice; whole dollars without cents, anything
//      else to the cent; none for a block with no price, a zero price or no
//      classes; never a price or a length typed in code;
//   2. the sign-up page of one block: one line under the whole price, small
//      and muted, worked out on the full price before the $20 assessment
//      credit, the same whether or not the credit shows; no figure, no line;
//   3. admin: the same line under the new-block form's price field, read
//      from the form as typed, and beside the price on the block's own page;
//      nothing about how a block is saved or sent changes;
//   4. nowhere else: a group card and the words a program page builds from
//      its cards show the whole price only (the source scan, with the sign-up
//      page as its one named exception, is in test-copy-truth.ts).
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COHORT_TOTAL,
  COHORT_TOTAL_CENTS,
  COHORT_WEEKS,
  PRICE_SUMMARY,
  SESSION_PRICE_LABEL,
  listedPrograms,
  priceLineFor,
  programGroups,
  programs,
} from "../content/programs";
import {
  blockFacts,
  cardsHeading,
  cardsPrice,
  cardsProgramLine,
  cardsScheduleLine,
  groupCards,
  groupForBlock,
  perClassFigure,
  perClassLine,
  type PerClassFigure,
} from "../lib/groupBlocks";
import { formatCohortPrice } from "../lib/cohorts";
import { generateSessionDates, planMakeup } from "../lib/makeup";
import { courseJsonLd } from "../lib/structuredData";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { EnrollWizard, type EtransferInfo } from "../app/enroll/[cohortId]/EnrollWizard";
import type { Cohort, SessionSlot } from "../types/cohort";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const ROOT = process.cwd();
/** A source file, its line endings normalised (this computer checks files out with CRLF). */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
/** The words a piece of markup shows, in order (a no-break space reads as a space). */
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** A no-break space, the one character a line keeps a number and its word together with. */
const NBSP = String.fromCharCode(0xa0);
/** A line as a reader sees it: its no-break spaces read as spaces. */
const plain = (line: string) => line.split(NBSP).join(" ");
/** A per-class figure in words: an amount, then "each", "a class" or "per class". */
const FIGURE_WORDS = /\$\d[\d.,]*\s*(each|a class|per class)\b|\bper[- ]class\b/i;

const SUNDAY: SessionSlot = { day: "Sun", start: "16:00", end: "17:00" };
const WEDNESDAY: SessionSlot = { day: "Wed", start: "18:00", end: "19:00" };

/** A public block as the coach builds one, priced from the setting unless a test says otherwise. */
const block = (over: Partial<Cohort> & Pick<Cohort, "id">): Cohort => ({
  programId: "bootcamps",
  locationId: "",
  label: over.id,
  startDate: "2027-01-10",
  endDate: "",
  weeks: COHORT_WEEKS,
  sessions: [SUNDAY],
  capacityMin: 3,
  capacityMax: 8,
  priceCents: COHORT_TOTAL_CENTS,
  currency: "CAD",
  status: "open",
  levelMin: 1,
  levelMax: 1.5,
  visibility: "public",
  dbStatus: "inviting",
  ...over,
});

// The sample blocks the pictures use too.
const onceAWeek = block({ id: "once" });
const twiceAWeek = block({ id: "twice", priceCents: COHORT_TOTAL_CENTS * 2, sessions: [SUNDAY, WEDNESDAY] });
const uneven = block({ id: "uneven", priceCents: 10000, weeks: 3 });
const unevenTwice = block({ id: "uneven-twice", priceCents: 25000, weeks: 8, sessions: [SUNDAY, WEDNESDAY] });
const samples: [string, Cohort][] = [
  ["once a week", onceAWeek],
  ["twice a week", twiceAWeek],
  ["a price that does not divide evenly", uneven],
  ["twice a week at a price that does not divide evenly", unevenTwice],
];

const figure = (b: Pick<Cohort, "priceCents" | "weeks" | "sessions"> & { startDate?: string | null }) => perClassFigure(b);
const same = (a: PerClassFigure | null, b: PerClassFigure | null) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. The figure ────────────────────────────────────────────────────────────
console.log("1. The figure: the block's own price over its classes, as its card counts them");
{
  const once = figure(onceAWeek);
  check("once a week: one class a week for the block's weeks, and the price over them", once?.classes === COHORT_WEEKS && once.cents === COHORT_TOTAL_CENTS / COHORT_WEEKS, JSON.stringify(once));
  check("…a block priced at the setting's total reads the setting's per-session amount, worked out from the block, not read from the setting", once?.amount === SESSION_PRICE_LABEL);
  check("…in whole dollars, with no cents", once?.amount === `$${COHORT_TOTAL / COHORT_WEEKS}` && !once.amount.includes("."), once?.amount);

  const twice = figure(twiceAWeek);
  check("twice a week: two classes a week, so twice the classes for the same figure at twice the price", twice?.classes === COHORT_WEEKS * 2 && twice.amount === SESSION_PRICE_LABEL, JSON.stringify(twice));
  const twiceSamePrice = figure(block({ id: "t", priceCents: 24000, weeks: 8, sessions: [SUNDAY, WEDNESDAY] }));
  check("…$240 over 16 classes is $15 a class", twiceSamePrice?.classes === 16 && twiceSamePrice.amount === "$15", JSON.stringify(twiceSamePrice));

  check("a price that does not divide evenly shows to the cent: $100 over 3 classes is $33.33", figure(uneven)?.amount === "$33.33" && figure(uneven)?.cents === 3333, JSON.stringify(figure(uneven)));
  check("…rounded to the nearest cent: $95 over 3 is $31.67, $250 over 16 is $15.63", figure(block({ id: "r", priceCents: 9500, weeks: 3 }))?.amount === "$31.67" && figure(unevenTwice)?.amount === "$15.63", `${figure(block({ id: "r", priceCents: 9500, weeks: 3 }))?.amount} ${figure(unevenTwice)?.amount}`);
  check("…always two places: $35 over 2 classes is $17.50, never $17.5", figure(block({ id: "h", priceCents: 3500, weeks: 2 }))?.amount === "$17.50");

  // A cancelled class. The block's confirmation writes one dated row per
  // class (ensureCohortSessions); cancelling one marks its row cancelled and
  // adds a make-up row by the make-up rule (cancelSession, planMakeup). The
  // block's own row, which the figure reads, does not change.
  const b = onceAWeek;
  const rows = generateSessionDates(b.startDate, b.weeks, b.sessions).map((s, i) => ({ id: `s${i}`, date: s.date, start: s.start, end: s.end, status: "scheduled", makeupFor: null as string | null }));
  const missed = rows[2];
  const withMakeup = (makeupMaxWeeks: number) =>
    planMakeup({
      cancelledDate: missed.date,
      cancelledStart: missed.start,
      cancelledEnd: missed.end,
      startDate: b.startDate,
      weeks: b.weeks,
      makeupMaxWeeks,
      slots: b.sessions,
      sessions: rows.map((r) => ({ date: r.date, start: r.start, status: r.id === missed.id ? "cancelled" : r.status })),
    });
  const plan = withMakeup(2);
  const after = plan.ok
    ? [...rows.map((r) => (r.id === missed.id ? { ...r, status: "cancelled" } : r)), { id: "m", date: plan.date, start: missed.start, end: plan.end, status: "scheduled", makeupFor: missed.id }]
    : [];
  const live = after.filter((r) => r.status !== "cancelled");
  check("a cancelled class: the coach's cancellation leaves a cancelled row and a make-up row", plan.ok && after.length === rows.length + 1 && live.length === rows.length && live.some((r) => r.makeupFor === missed.id));
  check("…the figure counts the class once: the cancelled row not counted, the make-up not counted twice", figure(b)?.classes === live.length && figure(b)?.classes !== after.length && figure(b)?.amount === SESSION_PRICE_LABEL, `${figure(b)?.classes} classes against ${live.length} live rows of ${after.length}`);
  check("…and is the figure the block read before the cancellation", same(figure(b), once));
  check("past the make-up cap the class is credited back, so the figure stays the one its card reads", !withMakeup(0).ok && same(figure(b), once));
  const actions = read("src/lib/cohortActions.ts");
  const cancel = actions.slice(actions.indexOf("export async function cancelSession("), actions.indexOf("export", actions.indexOf("export async function cancelSession(") + 10));
  check("…a cancellation writes the dated rows and, past the cap, only the credit flag on the block's row: never its price, weeks or class days", cancel.length > 200 && (cancel.match(/\.from\("cohorts"\)/g) ?? []).length === 1 && /\.from\("cohorts"\)\s*\.update\(\{ credit_followup: true \}\)/.test(cancel));

  const unpriced: [string, number][] = [
    ["a price of zero", 0],
    ["no price at all", undefined as unknown as number],
    ["a price that is not a number", Number.NaN],
    ["a price below zero", -100],
  ];
  for (const [name, priceCents] of unpriced) {
    check(`no figure for a block with ${name}`, figure(block({ id: "u", priceCents })) === null);
  }
  check("no figure for a block with no sessions", figure(block({ id: "n", sessions: [] })) === null);
  check("…nor with no weeks, or weeks that are not a whole number", figure(block({ id: "w", weeks: 0 })) === null && figure(block({ id: "w", weeks: Number.NaN })) === null && figure(block({ id: "w", weeks: Number.POSITIVE_INFINITY })) === null);

  check("it reads the block's row: $280 over 8 weeks is $35, over 7 weeks $40, and $300 over 8 weeks $37.50", figure(block({ id: "l", priceCents: 28000, weeks: 8 }))?.amount === "$35" && figure(block({ id: "l", priceCents: 28000, weeks: 7 }))?.amount === "$40" && figure(block({ id: "l", priceCents: 30000, weeks: 8 }))?.amount === "$37.50");
  const src = read("src/lib/groupBlocks.ts");
  const start = src.indexOf("export function perClassFigure(");
  const body = src.slice(start, src.indexOf("\n}\n", start));
  check("…and no price, length or total typed in code", start > 0 && body.length > 100 && !/SESSION_PRICE|COHORT_|GROUP_PRICE|PRICE_SUMMARY|\b35\b|\b210\b/.test(body), body);

  for (const [name, b2] of samples) {
    const f = figure(b2);
    const facts = blockFacts(b2);
    check(`${name}: the count is the one its card names`, f?.classes === facts.classes && facts.price.includes(`for ${f?.classes} classes`), `${f?.classes} vs ${facts.price}`);
  }
  check("a form with no start date yet counts as any date does", same(figure({ ...onceAWeek, startDate: "" }), figure(onceAWeek)) && same(figure({ ...twiceAWeek, startDate: undefined }), figure(twiceAWeek)) && same(figure({ ...twiceAWeek, startDate: "2027-03-03" }), figure(twiceAWeek)));

  check("the line: the classes, then the figure each", plain(perClassLine(once!)) === `${COHORT_WEEKS} classes, ${SESSION_PRICE_LABEL} each` && plain(perClassLine(figure(uneven)!)) === "3 classes, $33.33 each", plain(perClassLine(once!)));
  check("…one class reads its price, with no each", plain(perClassLine(figure(block({ id: "one", priceCents: 4000, weeks: 1 }))!)) === "1 class, $40");
  check("…each number keeps its word, so a narrow column breaks it only after the comma", perClassLine(once!) === `${COHORT_WEEKS}${NBSP}classes, ${SESSION_PRICE_LABEL}${NBSP}each` && plain(perClassLine(once!)).split(" ").length === 4);
  check("…and says nothing the voice brief bans: no exclamation, no dash, no a week", samples.every(([, b2]) => !/[!—–]|a week|session/i.test(perClassLine(figure(b2)!))));
}

// ── 2. The sign-up page ──────────────────────────────────────────────────────
console.log("2. The sign-up page: one line under the whole price, small and muted");
{
  type Extra = { signedIn?: boolean; etransfer?: EtransferInfo | null; creditWaiting?: boolean; seatsRemaining?: number | null };
  const signUpHtml = (b: Cohort, extra: Extra = {}) =>
    renderToStaticMarkup(
      createElement(EnrollWizard, {
        cohort: b,
        program: programs.find((p) => p.id === b.programId),
        group: groupForBlock(b),
        seatsRemaining: null,
        signInHref: "/login",
        signInLinkNext: `/enroll/${b.id}`,
        ...extra,
      })
    );
  const LINE_CLASS = "mb-2 mt-0.5 text-right text-xs text-white/60";
  for (const [name, b] of samples) {
    const html = signUpHtml(b);
    const line = perClassLine(figure(b)!);
    const shown = `<p class="${LINE_CLASS}">${line}</p>`;
    check(`${name}: "${plain(line)}" directly under the whole price`, words(html).includes(`Total ${formatCohortPrice(b)} ${plain(line)}`) && html.includes(`${formatCohortPrice(b)}</p></div>${shown}`), words(html).slice(words(html).indexOf("Total"), words(html).indexOf("Total") + 60));
    check("…once", html.split(line).length === 2 && words(html).split(plain(line)).length === 2);
  }
  const html = signUpHtml(onceAWeek);
  const line = perClassLine(figure(onceAWeek)!);
  check("small and muted: the smallest size and the muted white the page already uses for its secondary lines", html.includes(`<p class="${LINE_CLASS}">${line}</p>`) && html.includes('<p class="text-xs text-white/60">') && html.includes('<p class="mt-1 text-xs text-white/60">'));
  check("…tight to the total above it, with room before the $20 note under it (the note's own classes unchanged)", html.includes(`<p class="${LINE_CLASS}">${line}</p><p class="mt-1 text-xs text-white/60">Completed your $20 assessment?`));
  const lowSeats = words(signUpHtml(onceAWeek, { seatsRemaining: 2 }));
  const order = ["Total", plain(line), "Completed your $20 assessment?", "Only 2 spots left"].map((s) => lowSeats.indexOf(s));
  check("…and with the last spots showing, the order is the total, the line, the $20 note, the spots", order.every((at, i) => at > -1 && (i === 0 || at > order[i - 1])), order.join(" < "));
  /** Is the text at `at` inside an open `tag` element? Every one opened before it is closed before it, or not. */
  const inside = (markup: string, at: number, tag: string) => {
    const before = markup.slice(0, at);
    return (before.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length > (before.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
  };
  const at = html.indexOf(`<p class="${LINE_CLASS}">`);
  const inner = html.slice(html.indexOf(">", at) + 1, html.indexOf("</p>", at));
  check("…no icon, no bold, no colour, and not inside a button, a link or a heading", at > 0 && inner === line && !/font-(semibold|bold|medium)|#B4E655|yellow|sky-|red-/.test(LINE_CLASS) && ["button", "h1", "h2", "h3", "h4", "h5", "h6", "a"].every((tag) => !inside(html, at, tag)) && html.includes("<h1") && html.includes("<button"), inner);

  // Worked out on the full price, before the $20 assessment credit, and the
  // same whichever credit line shows under it.
  const credited = formatDollarsCents(Math.round((onceAWeek.priceCents - 2000) / COHORT_WEEKS));
  const etransferBlock = block({ id: "etransfer", paymentMode: "etransfer" });
  const views: [string, string][] = [
    ["signed out: sign in first and the $20 comes off", signUpHtml(onceAWeek)],
    ["an invitation's $20 on an e-transfer block: it comes off automatically", signUpHtml(etransferBlock, { etransfer: { recipientEmail: "pay@example.com", creditCents: 2000 } })],
    ["signed in with a $20 waiting on a sign-in link", signUpHtml(onceAWeek, { signedIn: true, creditWaiting: true })],
  ];
  check("the credit lines differ between those views", words(views[0][1]).includes("Sign in first, and that $20 comes off this price at payment.") && words(views[1][1]).includes("It comes off this price automatically at payment.") && !words(views[2][1]).includes("Completed your $20 assessment?"));
  for (const [name, view] of views) {
    check(`${name}: the line reads the full price's figure, before the credit`, view.includes(`<p class="${LINE_CLASS}">${line}</p>`) && !words(view).includes(`${credited} each`), `${credited}`);
  }
  check("no figure, no line: a block with no price shows Pricing TBA and nothing per class", !FIGURE_WORDS.test(words(signUpHtml(block({ id: "free", priceCents: 0 })))) && !signUpHtml(block({ id: "free", priceCents: 0 })).includes(LINE_CLASS) && words(signUpHtml(block({ id: "free", priceCents: 0 }))).includes("Total Pricing TBA"));
  const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
  check("the page works the figure out once, from the block, and draws it once", (wizard.match(/perClassFigure\(/g) ?? []).length === 1 && wizard.includes("const perClass = perClassFigure(cohort);") && (wizard.match(/perClassLine\(/g) ?? []).length === 1);
  const summary = wizard.slice(wizard.indexOf("function OrderSummary("), wizard.indexOf("function RegistrantStep("));
  const rest = wizard.replace(summary, "").replace('import { blockFacts, perClassFigure, perClassLine } from "@/lib/groupBlocks";', "");
  check("…in the summary only: nothing else in the wizard reads it, so the charged amount and the e-transfer amount are the block's price, as before", summary.includes("perClassFigure(cohort)") && !rest.includes("perClass") && wizard.includes("const total = cohort.priceCents * seats;") && wizard.includes("const due = amountDueCents(total, creditCents);"));
}

// ── 3. Admin ─────────────────────────────────────────────────────────────────
console.log("3. Admin: the same line beside the price, read only");
{
  const form = read("src/app/admin/cohorts/AdminCohortsClient.tsx");
  const priceRow = form.slice(form.indexOf('<div className="grid grid-cols-3 gap-3">\n        <div>\n          <label htmlFor="new-cohort-price"'), form.indexOf('htmlFor="new-cohort-visibility"'));
  check("the new-block form: a helper straight under the price field, across its row so it stays one line, tied to the field", priceRow.length > 200 && priceRow.includes('aria-describedby="new-cohort-per-class"') && priceRow.includes('<p id="new-cohort-per-class" className="col-span-3 -mt-2 min-h-4 text-xs tabular-nums text-white/60">\n          {perClass ? perClassLine(perClass) : ""}\n        </p>\n      </div>'));
  check("…read on the field's focus, never announced on every keystroke, and its line kept when empty", !priceRow.includes('role="status"') && !priceRow.includes("aria-live") && priceRow.includes("min-h-4"));
  check("…read from the price as the form sends it, the weeks, the class days and the start date, as he types", form.includes('priceCents: Math.round(Number(priceDollars || "0") * 100),\n        weeks,\n        sessions: slots as SessionSlot[],\n        startDate,') && form.includes("[priceDollars, weeks, slots, startDate]"));
  check("…display only: no field, and the block is saved and sent exactly as before", (form.match(/<input/g) ?? []).length === 11 && form.includes('body: JSON.stringify({\n          programId,\n          label,') && form.includes('priceCents: Math.round(Number(priceDollars || "0") * 100),\n          capacityMin,') && !form.slice(form.indexOf("async function submit"), form.indexOf("if (!open)")).includes("perClass"));
  // What he types is what a visitor reads: the form's draft, with no start
  // date yet, and the block it saves read the same figure.
  const draft = { priceCents: Math.round(Number("280") * 100), weeks: 8, sessions: [SUNDAY], startDate: "" };
  check("…the figure he reads before saving is the one the block's sign-up page shows after", same(figure(draft), figure(block({ id: "saved", priceCents: 28000, weeks: 8 }))) && plain(perClassLine(figure(draft)!)) === "8 classes, $35 each");

  const page = read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx");
  check("the block's own page (it edits no price, weeks or class days): the line under the price, from the block's row", page.includes("const perClass = perClassFigure(cohort);") && page.includes('{perClass && <p className="mt-0.5 text-xs tabular-nums text-white/60">{perClassLine(perClass)}</p>}'));
  check("…which sends nothing new: the page's one update is still the payment mode", (page.match(/action: "update"/g) ?? []).length === 1 && page.includes('JSON.stringify({ action: "update", paymentMode: mode })'));
}

// ── 4. Nowhere else ──────────────────────────────────────────────────────────
console.log("4. Nowhere else: the cards and a program page show the whole price only");
{
  for (const [name, b] of samples) {
    const card = groupCards(programGroups, [b]).find((c) => c.block?.cohortId === b.id)!;
    const cardWords = words(renderToStaticMarkup(createElement(ProgramGroupCard, { group: card.group, block: card.block })));
    const f = figure(b)!;
    check(`${name}: its group card shows the whole price, and no figure`, cardWords.includes(card.block!.price.split(" for ")[0]) && !cardWords.includes(`${f.amount} each`) && !FIGURE_WORDS.test(cardWords), cardWords.slice(-90));
  }
  check("a card's facts carry no per-class field", Object.keys(blockFacts(onceAWeek)).sort().join() === ["cohortId", "firstClass", "dates", "days", "weekly", "price", "totalCents", "classes", "seatsLeft"].sort().join(), Object.keys(blockFacts(onceAWeek)).join());

  const cards = groupCards(programGroups.filter((g) => g.programSlug === "bootcamps"), samples.map(([, b]) => b));
  const pageWords = [cardsHeading(cards), cardsPrice(cards, PRICE_SUMMARY), priceLineFor(cardsPrice(cards, PRICE_SUMMARY)), cardsScheduleLine(cards), cardsProgramLine(cards)];
  check("the words a program page builds from its cards carry no figure", pageWords.every((w) => !FIGURE_WORDS.test(w) && !samples.some(([, b]) => w.includes(`${figure(b)!.amount} each`))), pageWords.join(" | "));
  const ld = listedPrograms.map((p) => JSON.stringify(courseJsonLd(p) ?? {})).join("\n");
  check("the structured data carries none either", !FIGURE_WORDS.test(ld) && !/each/i.test(ld));
}

function formatDollarsCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll per-class checks passed.");

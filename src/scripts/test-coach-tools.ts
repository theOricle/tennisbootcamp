// Run from project root: npx tsx src/scripts/test-coach-tools.ts
//
// Pins backlog #104, the coach's admin on a phone:
//   1. The new-cohort form's weekly class: on a phone the day select has its
//      own line (with the remove button), the two times sit side by side
//      under it; from 640px it is the one row it was, element for element. Under
//      the slots, the schedule in words, built by the group cards' helpers.
//   2. A cohort's invite row on a phone: the chip on the name line, the name
//      and account lines wrapped (never cut), the buttons on their own line
//      under the text, the main one first.
//   3. No admin page or admin route string says "migration". A failed read
//      says what it couldn't load, with Retry; a 401 or 403 says the sign-in
//      has ended, with "Sign in again" and no Retry; neither is ever an
//      empty-list line, and the lists already on screen survive.
//   4. A paid assessment booking shows a "Paid" chip and a quiet "Undo"; the
//      booking is marked unpaid only from the confirmation's "Mark unpaid".
//   5. "Waiting on you" on /admin: its lines from sample rows (counts, links,
//      Toronto's today and tomorrow, test rows left out), the quiet line, the
//      couldn't-check line, and the reads only after the gate.
//
// The repo has no DOM test runner: views are rendered to static markup, a
// click handler is read off the elements a component returns, and fetch is a
// stand-in. Every check catches its own error. Exits non-zero on any failure.

import "./stub-server-only";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blockScheduleLine } from "../lib/groupBlocks";
import {
  COHORT_NOT_FOUND,
  SIGNED_OUT_LINE,
  SIGN_IN_AGAIN,
  adminRead,
  loadCohortList,
  problemForStatus,
} from "../lib/adminLoad";
import { AdminLoadProblem } from "../components/admin/LoadProblem";
import { CohortListStatus, SlotRow } from "../app/admin/cohorts/AdminCohortsClient";
import { InviteItem, type InviteRow } from "../app/admin/cohorts/[id]/AdminCohortDetailClient";
import {
  EMPTY_LISTS,
  PaidStatus,
  SectionStatus,
  UnmarkPaidConfirm,
  loadAssessmentLists,
  type AssessmentLists,
  type Booking,
} from "../app/admin/assessments/AdminAssessmentsClient";
import { unmarkPaidLine } from "../lib/assessmentPaid";
import {
  DESK_ASSESSMENTS_GAP,
  DESK_COHORTS_GAP,
  DESK_QUIET_LINE,
  amountsDue,
  deskFrom,
  holdEndsToday,
  transferIsWaiting,
  type CohortSide,
  type DeskBooking,
  type DeskInvite,
} from "../lib/adminDesk";
import { readAdminDesk } from "../lib/adminDeskReads";
import { WaitingOnYou } from "../components/admin/WaitingOnYou";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const render = (el: ReactElement) => renderToStaticMarkup(el);
const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const words = (html: string) =>
  unescape(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** The class list of the first tag that matches. */
const classOf = (html: string, tag: RegExp) => /\bclass="([^"]*)"/.exec(tag.exec(html)?.[0] ?? "")?.[1]?.split(/\s+/) ?? [];
/** A source file without its comments: what is left is code and the strings a screen can show. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

/** Every file under a folder. */
function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(ROOT, path)).isDirectory() ? files(path) : [path];
  });
}

type Clickable = { text: string; onClick?: () => void; type: unknown };
/** Every button and link in an element tree a hook-free component returned. */
function clickables(node: ReactNode): Clickable[] {
  if (Array.isArray(node)) return node.flatMap(clickables);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  const inner = clickables(el.props.children);
  if (el.type === "button" || el.type === "a") {
    return [{ text: words(render(el)), onClick: el.props.onClick, type: el.type }, ...inner];
  }
  return inner;
}

type FakeAnswer = { status: number; body?: unknown } | "throw";
/** A stand-in fetch: each URL answers with its status and body, or throws. */
function fakeFetch(answers: Record<string, FakeAnswer>) {
  return async (url: string) => {
    const answer = answers[url] ?? { status: 200, body: {} };
    if (answer === "throw") throw new Error("offline");
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body ?? {},
    };
  };
}

async function main() {
  // ─── 1. The slot row and the schedule line ───────────────────────────────────
  console.log("\n1. The new-cohort form's class day on a phone");

  const noop = () => undefined;
  const slotHtml = render(
    createElement(SlotRow, { slot: { day: "Thu", start: "19:00", end: "20:00" }, onChange: noop, onRemove: noop })
  );
  const slotRow = classOf(slotHtml, /<div[^>]*>/);
  const dayCls = classOf(slotHtml, /<select[^>]*>/);
  const [startCls, endCls] = [...slotHtml.matchAll(/<input[^>]*type="time"[^>]*\/>/g)].map((m) => classOf(m[0], /<input[^>]*>/));
  const removeCls = classOf(slotHtml, /<button[^>]*>/);
  check("on a phone the row is a grid: two equal columns for the times and a 44px end column", () =>
    slotRow.includes("max-sm:grid") && slotRow.includes("max-sm:grid-cols-[calc(50%-0.25rem)_minmax(0,1fr)_2.75rem]")
  );
  check("the day select has the first line to itself, at full width", () =>
    dayCls.includes("max-sm:row-start-1") && dayCls.includes("max-sm:col-span-2") && dayCls.includes("max-sm:w-full")
  );
  check("the remove button ends the day's line, at 44px", () =>
    removeCls.includes("max-sm:row-start-1") && removeCls.includes("max-sm:col-start-3") && removeCls.includes("min-h-[44px]") && removeCls.includes("min-w-[44px]")
  );
  check("the two times sit side by side on the line under it, each half the row", () =>
    !!startCls &&
    !!endCls &&
    startCls.includes("max-sm:row-start-2") &&
    startCls.includes("max-sm:col-start-1") &&
    endCls.includes("max-sm:row-start-2") &&
    endCls.includes("max-sm:col-start-2") &&
    endCls.includes("max-sm:col-span-2")
  );
  check("from 640px it is main's one row: day, start, end, remove, every added class phone-only", () => {
    const order = [...slotHtml.matchAll(/<(select|input|button)\b/g)].map((m) => m[1]).join(" ");
    const base = (cls: string[]) => cls.filter((c) => !c.startsWith("max-sm:")).join(" ");
    return (
      order === "select input input button" &&
      base(slotRow) === "flex items-center gap-2" &&
      base(dayCls).endsWith("focus:ring-[#B4E655]/30 w-24") &&
      base(removeCls) === "min-h-[44px] min-w-[44px] rounded-full text-white/60 hover:text-red-200" &&
      base(startCls ?? []) === base(endCls ?? []) &&
      base(startCls ?? []).endsWith("focus:ring-[#B4E655]/30")
    );
  });
  check("the only slot's day takes the whole first line", () =>
    classOf(
      render(createElement(SlotRow, { slot: { day: "Sat", start: "12:00", end: "13:00" }, onChange: noop })),
      /<select[^>]*>/
    ).includes("max-sm:col-span-3")
  );
  check("the only slot has no remove button", () =>
    !/Remove session slot/.test(
      render(createElement(SlotRow, { slot: { day: "Sat", start: "12:00", end: "13:00" }, onChange: noop }))
    )
  );

  const thursdays = blockScheduleLine({
    startDate: "2027-01-14",
    weeks: 6,
    sessions: [{ day: "Thu", start: "19:00", end: "20:00" }],
  });
  check("the schedule line: the class day and time, then the first class to the last", () => thursdays === "Thursdays 7–8pm · Jan 14 – Feb 18", () => thursdays);
  const twice = blockScheduleLine({
    startDate: "2027-01-11",
    weeks: 6,
    sessions: [
      { day: "Sat", start: "15:00", end: "16:00" },
      { day: "Wed", start: "18:00", end: "19:00" },
    ],
  });
  check("two slots: each day with its time, in the week's order, and the dates of the classes", () => twice === "Wednesdays 6–7pm, Saturdays 3–4pm · Jan 13 – Feb 20", () => twice);
  check("before a start date is typed: the class days alone", () =>
    blockScheduleLine({ startDate: "", weeks: 6, sessions: [{ day: "Sat", start: "12:00", end: "13:00" }] }) === "Saturdays 12–1pm"
  );
  check("no class to show: no line", () => blockScheduleLine({ startDate: "2027-01-14", weeks: 6, sessions: [] }) === "");
  const cohortsSrc = read("src/app/admin/cohorts/AdminCohortsClient.tsx");
  check("the form shows the line under the slots, announced as it changes", () =>
    /<SlotRow[\s\S]*?id="new-cohort-schedule" aria-live="polite"[\s\S]*?\{scheduleLine\}[\s\S]*?\+ Add a session slot/.test(cohortsSrc)
  );

  // ─── 2. The invite row ───────────────────────────────────────────────────────
  console.log("\n2. A cohort's invite row on a phone");

  const waiting: InviteRow = {
    id: "i1",
    email: "dana.chen@example.com",
    participant_name: "Maya Alexandra Chen-Okafor",
    account_name: "Dana Chen",
    token: "t",
    status: "invited",
    invited_at: "2026-11-25T15:00:00Z",
    expires_at: "2026-11-27T15:00:00Z",
    payment_method: "etransfer",
    payment_note: "Stripe session cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0",
    paid_at: null,
    amountDueCents: 19000,
  };
  const paidRow: InviteRow = { ...waiting, id: "i2", status: "paid", paid_at: "2026-11-26T15:00:00Z", amountDueCents: null };
  const inviteHtml = render(createElement(InviteItem, { cohortId: "c1", invite: waiting, onChanged: noop }));
  const paidHtml = render(createElement(InviteItem, { cohortId: "c1", invite: paidRow, onChanged: noop }));
  const paragraphs = [...inviteHtml.matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)].map(([, cls, inner]) => ({
    cls: cls.split(/\s+/),
    text: words(inner),
  }));
  const nameP = paragraphs.find((p) => p.text === "Maya Alexandra Chen-Okafor");
  const accountP = paragraphs.find((p) => p.text.startsWith("Account:"));
  const noteP = paragraphs.find((p) => p.text.startsWith("Stripe session"));
  check("the name wraps on a phone: cut only from 640px", () =>
    !!nameP && !nameP.cls.includes("truncate") && nameP.cls.includes("sm:truncate") && nameP.cls.includes("max-sm:[overflow-wrap:anywhere]")
  );
  check("the account line wraps on a phone: cut only from 640px", () =>
    !!accountP && !accountP.cls.includes("truncate") && accountP.cls.includes("sm:truncate") && accountP.cls.includes("max-sm:[overflow-wrap:anywhere]")
  );
  check("a long id in the note breaks inside its column", () => !!noteP && noteP.cls.includes("max-sm:[overflow-wrap:anywhere]"));
  check("the status chip sits on the name line on a phone, and before the buttons from 640px", () => {
    const chips = [...inviteHtml.matchAll(/<span class="([^"]*)">Invited<\/span>/g)].map((m) => m[1].split(/\s+/));
    const nameLine = /<div class="[^"]*max-sm:flex[^"]*"><p[\s\S]*?<\/p><span class="[^"]*sm:hidden[^"]*">Invited<\/span><\/div>/.test(inviteHtml);
    return chips.length === 2 && chips[0].includes("sm:hidden") && chips[1].includes("max-sm:hidden") && nameLine;
  });
  const actions = /<div class="([^"]*)" data-invite-actions="">([\s\S]*?)<\/div>/.exec(inviteHtml);
  check("the buttons have a line of their own under the text on a phone", () => {
    const outer = classOf(inviteHtml, /<li[^>]*><div[^>]*>/.exec(inviteHtml) ? /<li[^>]*><div[^>]*>/ : /<div[^>]*>/);
    const row = /<li[^>]*><div class="([^"]*)">/.exec(inviteHtml)?.[1].split(/\s+/) ?? outer;
    return !!actions && row.includes("max-sm:flex-col") && actions[1].split(/\s+/).includes("max-sm:flex-wrap");
  });
  const buttonTexts = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => words(m[1]));
  check('a payable row: "Mark paid…" first, then "Send account email"', () =>
    JSON.stringify(buttonTexts(actions?.[2] ?? "")) === JSON.stringify(["Mark paid…", "Send account email"])
  , () => JSON.stringify(buttonTexts(actions?.[2] ?? "")));
  check('a paid row: "Undo" first, then "Send account email"', () => {
    const paidActions = /<div class="[^"]*" data-invite-actions="">([\s\S]*?)<\/div>/.exec(paidHtml)?.[1] ?? "";
    return JSON.stringify(buttonTexts(paidActions)) === JSON.stringify(["Undo", "Send account email"]);
  });
  check('"Send account email" is the quieter one on a phone: words, no outline', () => {
    const cls = /<button[^>]*class="([^"]*)"[^>]*>Send account email<\/button>/.exec(inviteHtml)?.[1].split(/\s+/) ?? [];
    return cls.includes("max-sm:border-transparent") && cls.includes("max-sm:underline") && cls.includes("min-h-[44px]");
  });
  check("from 640px the row keeps its one line: every phone class is max-sm, the cut names stay", () => {
    const row = /<li[^>]*><div class="([^"]*)">/.exec(inviteHtml)?.[1] ?? "";
    return /^flex items-center justify-between gap-3( max-sm:\S+)+$/.test(row) && /^flex shrink-0 items-center gap-2( max-sm:\S+)+$/.test(actions?.[1] ?? "");
  });

  // ─── 3. Honest load errors ───────────────────────────────────────────────────
  console.log("\n3. Load errors that say what happened");

  const adminSources = [
    ...files("src/app/admin"),
    ...files("src/app/api/admin"),
    ...files("src/app/api/assessment/admin"),
    ...files("src/components/admin"),
  ].filter((p) => /\.tsx?$/.test(p));
  const mentions = adminSources.filter((p) => /migration/i.test(code(read(p))));
  check('no admin page or admin route string says "migration"', () => adminSources.length > 10 && mentions.length === 0, () => mentions.join(", "));
  check("an unknown cohort reads as not found, from the route too", () =>
    read("src/app/api/admin/cohorts/[id]/route.ts").includes(`{ error: "We couldn't find this cohort." }`)
  );

  check("a 401 and a 403 are an ended sign-in, a 404 not found, a 500 a failed read", () =>
    problemForStatus(401) === "signed_out" &&
    problemForStatus(403) === "signed_out" &&
    problemForStatus(404) === "not_found" &&
    problemForStatus(500) === "failed" &&
    problemForStatus(200) === null
  );
  const offline = await adminRead("/x", fakeFetch({ "/x": "throw" }));
  const forbidden = await adminRead("/x", fakeFetch({ "/x": { status: 403, body: { error: "Forbidden" } } }));
  check("a read that never arrives is a failed read; a 403 is an ended sign-in", () =>
    !offline.ok && offline.problem === "failed" && !forbidden.ok && forbidden.problem === "signed_out"
  );
  const notReady = await loadCohortList(fakeFetch({ "/api/admin/cohorts": { status: 200, body: { cohorts: [], dbReady: false } } }));
  const ready = await loadCohortList(fakeFetch({ "/api/admin/cohorts": { status: 200, body: { cohorts: [{ id: "c1" }], dbReady: true } } }));
  check("the cohorts list reads dbReady: false as a failed read, never as no cohorts", () =>
    !notReady.ok && notReady.problem === "failed" && ready.ok && ready.data.length === 1
  );
  check("the cohorts route still answers dbReady", () => (code(read("src/app/api/admin/cohorts/route.ts")).match(/dbReady: false/g) ?? []).length === 3);

  const listFailed = words(render(createElement(CohortListStatus, { loading: false, loaded: false, problem: "failed", count: 0, onRetry: noop })));
  const listSignedOutHtml = render(createElement(CohortListStatus, { loading: false, loaded: true, problem: "signed_out", count: 0, onRetry: noop }));
  const listEmpty = words(render(createElement(CohortListStatus, { loading: false, loaded: true, problem: null, count: 0, onRetry: noop })));
  check("cohorts, a failed read: what it couldn't load, Retry, and never the empty-list line", () => listFailed === "Couldn't load the cohorts. Retry", () => listFailed);
  check("cohorts, an ended sign-in: the line, a link to the page itself, no Retry, no empty-list line", () =>
    words(listSignedOutHtml) === `${SIGNED_OUT_LINE} ${SIGN_IN_AGAIN}` && /<a href="\/admin\/cohorts"[^>]*>Sign in again<\/a>/.test(listSignedOutHtml)
  , () => words(listSignedOutHtml));
  check("cohorts, a read that answered with none: the empty-list line", () => listEmpty === "No cohorts yet.");
  check("the cohorts page keeps its rows when a read fails", () =>
    /if \(result\.ok\) \{\s*setCohorts\(result\.data\);[\s\S]*?\} else \{\s*setProblem\(result\.problem\);\s*\}/.test(cohortsSrc) &&
    (cohortsSrc.match(/setCohorts\(/g) ?? []).length === 1
  );
  check("every load problem is announced", () =>
    (["failed", "signed_out", "not_found"] as const).every((problem) =>
      /<p role="alert"/.test(render(createElement(AdminLoadProblem, { problem, what: "the players", here: "/admin/players", onRetry: noop })))
    )
  );

  const notFoundHtml = render(createElement(AdminLoadProblem, { problem: "not_found", what: "this cohort", here: "/admin/cohorts/x", onRetry: noop }));
  check("an unknown cohort: not found, with the way back to the list and no Retry", () =>
    words(notFoundHtml) === `${COHORT_NOT_FOUND} Back to cohorts` && /<a[^>]*href="\/admin\/cohorts"/.test(notFoundHtml)
  , () => words(notFoundHtml));
  const detailSrc = read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx");
  check("a cohort's page keeps the cohort on screen when a refresh fails", () =>
    /if \(!detail\) return loadProblem \|\|/.test(detailSrc) &&
    /\{loadProblem\}\s*\{\/\* Header \*\/\}/.test(detailSrc) &&
    (detailSrc.match(/setDetail\(/g) ?? []).length === 1 &&
    /if \(result\.ok\) \{\s*setProblem\(null\);\s*setDetail\(result\.data\);/.test(detailSrc)
  );

  const playersSrc = read("src/app/admin/players/AdminPlayersClient.tsx");
  check("the players page's load error has Retry and is announced, and keeps its rows", () =>
    /<AdminLoadProblem\s+problem=\{loadError\}\s+what="the players"\s+here="\/admin\/players"\s+onRetry=\{\(\) => void refresh\(\)\}/.test(playersSrc) &&
    /if \(result\.ok\) \{[\s\S]*?setPlayers\(/.test(playersSrc) &&
    (playersSrc.match(/setPlayers\(/g) ?? []).length === 1
  );
  const playersFailed = words(render(createElement(AdminLoadProblem, { problem: "failed", what: "the players", here: "/admin/players", onRetry: noop })));
  check("players, a failed read: its line and Retry", () => playersFailed === "Couldn't load the players. Retry");

  // Assessments: each section's own read.
  const onScreen: AssessmentLists = {
    ...EMPTY_LISTS,
    bookings: [{ id: "b1" } as Booking],
    requests: [{ id: "r-old" }] as AssessmentLists["requests"],
  };
  const partial = await loadAssessmentLists(
    onScreen,
    fakeFetch({
      "/api/assessment/admin/blocks": { status: 200, body: { blocks: [{ id: "k1" }] } },
      "/api/assessment/admin/bookings": { status: 500, body: { error: "boom" } },
      "/api/assessment/admin/requests": { status: 200, body: { requests: [] } },
      "/api/assessment/slots": { status: 200, body: { blocks: [] } },
    })
  );
  check("assessments: the list whose read failed keeps its rows; the others refresh", () =>
    partial.lists.bookings.length === 1 &&
    partial.lists.bookings[0].id === "b1" &&
    partial.lists.requests.length === 0 &&
    partial.lists.blocks.length === 1 &&
    partial.problems.bookings === "failed" &&
    partial.problems.requests === null &&
    partial.problems.blocks === null &&
    partial.problems.signedOut === false
  );
  const down = await loadAssessmentLists(
    onScreen,
    fakeFetch({
      "/api/assessment/admin/blocks": "throw",
      "/api/assessment/admin/bookings": "throw",
      "/api/assessment/admin/requests": "throw",
      "/api/assessment/slots": "throw",
    })
  );
  check("assessments: every list survives a refresh that never arrives", () =>
    down.lists.bookings.length === 1 && down.lists.requests.length === 1 && down.problems.requests === "failed" && down.problems.openSlots === "failed"
  );
  const lapsed = await loadAssessmentLists(
    onScreen,
    fakeFetch({
      "/api/assessment/admin/blocks": { status: 403, body: { error: "Forbidden" } },
      "/api/assessment/admin/bookings": { status: 403, body: { error: "Forbidden" } },
      "/api/assessment/admin/requests": { status: 403, body: { error: "Forbidden" } },
    })
  );
  check("assessments: a 403 is an ended sign-in, and the lists stay", () => lapsed.problems.signedOut && lapsed.lists.bookings.length === 1);

  const section = (problem: "failed" | "signed_out" | null, signedOut: boolean, count = 0) =>
    words(
      render(
        createElement(SectionStatus, {
          loading: false,
          problem,
          signedOut,
          what: "the bookings",
          count,
          empty: "No bookings yet.",
          onRetry: noop,
        })
      )
    );
  check("a section whose read failed says so, with Retry, and never its empty-list line", () => section("failed", false) === "Couldn't load the bookings. Retry");
  check("an ended sign-in is said once over the page: a section then says nothing, not its empty-list line", () => section("signed_out", true) === "");
  check("a section whose read answered with none says its empty-list line", () => section(null, false) === "No bookings yet.");
  const assessSrc = read("src/app/admin/assessments/AdminAssessmentsClient.tsx");
  check('"No open requests." and "No bookings yet." are written only as a section\'s empty line', () =>
    (assessSrc.match(/No open requests\./g) ?? []).length === 1 &&
    (assessSrc.match(/No bookings yet\./g) ?? []).length === 1 &&
    /empty="No open requests\."/.test(assessSrc) &&
    /empty="No bookings yet\."/.test(assessSrc)
  );
  check("the assessments page says an ended sign-in once, with the way back in", () =>
    /\{problems\.signedOut && \(\s*<AdminLoadProblem\s+problem="signed_out"[\s\S]*?here="\/admin\/assessments"/.test(assessSrc)
  );

  // ─── 4. A safe "Paid" ────────────────────────────────────────────────────────
  console.log('\n4. "Paid" on an assessment booking');

  const calls: string[] = [];
  const paidProps = {
    paid: true,
    busy: false,
    undoing: false,
    onMarkPaid: () => void calls.push("mark-paid"),
    onAskUndo: () => void calls.push("ask-undo"),
  };
  const paidStatusHtml = render(createElement(PaidStatus, paidProps));
  check('a paid booking shows "Paid" as a chip, not a button', () =>
    /<span class="[^"]*rounded-full[^"]*">Paid<\/span>/.test(paidStatusHtml) && !/<button[^>]*>[^<]*Paid/.test(paidStatusHtml)
  );
  const paidButtons = clickables(PaidStatus(paidProps));
  check('its one button is a quiet "Undo", at 44px', () =>
    paidButtons.length === 1 &&
    paidButtons[0].text === "Undo" &&
    /<button[^>]*class="[^"]*min-h-\[44px\][^"]*border-white\/20[^"]*"[^>]*>Undo<\/button>/.test(paidStatusHtml)
  );
  paidButtons[0]?.onClick?.();
  check('"Undo" only opens the confirmation: nothing is marked', () => JSON.stringify(calls) === JSON.stringify(["ask-undo"]));
  check('with the confirmation open, "Undo" steps aside and the chip stays', () => {
    const open = PaidStatus({ ...paidProps, undoing: true });
    return clickables(open).length === 0 && words(render(createElement(PaidStatus, { ...paidProps, undoing: true }))) === "Paid";
  });
  const unpaidButtons = clickables(PaidStatus({ ...paidProps, paid: false }));
  calls.length = 0;
  unpaidButtons[0]?.onClick?.();
  check('"Mark paid" on an unpaid booking is unchanged: one tap', () =>
    unpaidButtons.length === 1 && unpaidButtons[0].text === "Mark paid" && JSON.stringify(calls) === JSON.stringify(["mark-paid"])
  );

  calls.length = 0;
  const confirmProps = {
    line: unmarkPaidLine({ status: "completed", credit_status: "unused" }),
    busy: false,
    error: null,
    onConfirm: () => void calls.push("unpaid"),
    onKeep: () => void calls.push("keep"),
  };
  const confirmButtons = clickables(UnmarkPaidConfirm(confirmProps));
  check('the confirmation: one line, then "Mark unpaid" and "Keep it paid"', () =>
    JSON.stringify(confirmButtons.map((b) => b.text)) === JSON.stringify(["Mark unpaid", "Keep it paid"]) &&
    words(render(createElement(UnmarkPaidConfirm, confirmProps))).startsWith(confirmProps.line)
  );
  confirmButtons[1]?.onClick?.();
  check('"Keep it paid" marks nothing', () => JSON.stringify(calls) === JSON.stringify(["keep"]));
  confirmButtons[0]?.onClick?.();
  check('"Mark unpaid" is the confirmation\'s own button', () => JSON.stringify(calls) === JSON.stringify(["keep", "unpaid"]));
  const bookingCard = assessSrc.slice(assessSrc.indexOf("export function BookingCard"), assessSrc.indexOf("// ─── Request card"));
  check("the booking is marked unpaid from the confirmation alone", () =>
    (bookingCard.match(/setPaid\(false\)/g) ?? []).length === 1 &&
    /<UnmarkPaidConfirm[\s\S]*?onConfirm=\{\(\) => void setPaid\(false\)\}/.test(bookingCard) &&
    /onMarkPaid=\{\(\) => void setPaid\(true\)\}/.test(bookingCard) &&
    /onAskUndo=\{\(\) => \{\s*setError\(null\);\s*setUndoing\(true\);\s*\}\}/.test(bookingCard) &&
    !/paid: !booking\.paid/.test(bookingCard) &&
    !/togglePaid/.test(bookingCard)
  );
  check("the line says only what is true of the $20, by the credit's own rule", () => {
    const unused = unmarkPaidLine({ status: "completed", credit_status: "unused" });
    const applied = unmarkPaidLine({ status: "completed", credit_status: "applied" });
    const booked = unmarkPaidLine({ status: "booked", credit_status: "unused" });
    return (
      unused === "The booking and its time stay. The $20 stops coming off a program price until the assessment is marked paid again." &&
      applied === "The booking and its time stay. The $20 has already come off a program price, and that does not change." &&
      booked === "The booking and its time stay. The $20 comes off a program price only once the assessment is paid and completed." &&
      unmarkPaidLine({ status: "completed" }) === booked
    );
  });
  check("the credit's rule is the one the line describes: completed, paid, unused", () =>
    /return booking\.status === "completed" && booking\.paid === true && booking\.credit_status === "unused";/.test(read("src/lib/creditRules.ts"))
  );

  // ─── 5. Waiting on you ───────────────────────────────────────────────────────
  console.log('\n5. "Waiting on you" on /admin');

  // Thursday 2026-11-26, 10:00 in Toronto (15:00 UTC).
  const now = new Date("2026-11-26T15:00:00Z");
  const invite = (id: string, cohort_id: string, patch: Partial<DeskInvite>): DeskInvite => ({
    id,
    cohort_id,
    status: "invited",
    payment_method: null,
    expires_at: "2026-11-28T15:00:00Z",
    ...patch,
  });
  const cohortSide: CohortSide = {
    cohorts: [
      { id: "sat-int", label: "Saturday 12pm Intermediate", dbStatus: "inviting" },
      { id: "sun-beg", label: "Sunday 4pm Beginner", dbStatus: "confirmed" },
      { id: "old", label: "Fall cohort", dbStatus: "completed" },
      { id: "gone", label: "Cancelled cohort", dbStatus: "cancelled" },
    ],
    invites: [
      invite("t1", "sat-int", { payment_method: "etransfer" }),
      // A hold that lapsed while the money was on its way is still to mark.
      invite("t2", "sat-int", { payment_method: "etransfer", status: "expired", expires_at: "2026-11-25T15:00:00Z" }),
      invite("p1", "sat-int", { status: "paid", payment_method: "etransfer" }),
      // Ends 23:30 Toronto today (04:30 UTC tomorrow): today, by Toronto's date.
      invite("h1", "sat-int", { expires_at: "2026-11-27T04:30:00Z" }),
      // Ends 00:30 Toronto tomorrow: not today.
      invite("h2", "sat-int", { expires_at: "2026-11-27T05:30:00Z" }),
      // Ended an hour ago: nothing left to act on.
      invite("h3", "sat-int", { expires_at: "2026-11-26T14:00:00Z" }),
      // A waiting e-transfer whose hold ends today has the e-transfer line, not a second one.
      invite("t3", "sun-beg", { payment_method: "etransfer", expires_at: "2026-11-27T01:00:00Z" }),
      invite("x1", "old", { payment_method: "etransfer" }),
      invite("x2", "gone", { payment_method: "etransfer", expires_at: "2026-11-27T01:00:00Z" }),
    ],
    amountDueCents: new Map<string, number | null>([
      ["t1", 19000],
      ["t2", 17000],
      ["t3", 17000],
    ]),
  };
  const bookings: DeskBooking[] = [
    { id: "r1", status: "requested", block_date: null },
    { id: "r2", status: "requested", block_date: null },
    { id: "a1", status: "booked", block_date: "2026-11-26" },
    { id: "a2", status: "booked", block_date: "2026-11-27" },
    { id: "a3", status: "booked", block_date: "2026-11-27" },
    { id: "a4", status: "booked", block_date: "2026-11-28" },
    // Left out: a test booking, and ones that are done or gone.
    { id: "z1", status: "test", block_date: "2026-11-26" },
    { id: "z2", status: "completed", block_date: "2026-11-26" },
    { id: "z3", status: "cancelled", block_date: "2026-11-27" },
  ];
  const desk = deskFrom({ now, cohorts: { ok: true, data: cohortSide }, assessments: { ok: true, data: bookings } });
  const shown = desk.lines.map((l) => `${l.count} ${l.text}${l.detail ? ` | ${l.detail}` : ""} -> ${l.href}`);
  const expected = [
    "2 e-transfers to mark received | Saturday 12pm Intermediate · $190 and $170 due -> /admin/cohorts/sat-int",
    "1 e-transfer to mark received | Sunday 4pm Beginner · $170 due -> /admin/cohorts/sun-beg",
    "2 assessment requests without a time -> /admin/assessments",
    "1 assessment today -> /admin/assessments",
    "2 assessments tomorrow -> /admin/assessments",
    "1 held spot ends today | Saturday 12pm Intermediate -> /admin/cohorts/sat-int",
  ];
  check("the lines from sample rows: counts, words, links, in order", () => JSON.stringify(shown) === JSON.stringify(expected), () => JSON.stringify(shown, null, 1));
  check("with items waiting there is no quiet line and no couldn't-check line", () => !desk.quiet && desk.gaps.length === 0);
  check("a waiting e-transfer is unpaid by e-transfer, lapsed hold or not; a paid one never", () =>
    transferIsWaiting({ status: "invited", payment_method: "etransfer" }) &&
    transferIsWaiting({ status: "expired", payment_method: "etransfer" }) &&
    !transferIsWaiting({ status: "paid", payment_method: "etransfer" }) &&
    !transferIsWaiting({ status: "invited", payment_method: "card" }) &&
    !transferIsWaiting({ status: "invited", payment_method: null })
  );
  check("a hold ends today by Toronto's date, and only while it is still open", () =>
    holdEndsToday(invite("a", "c", { expires_at: "2026-11-27T04:30:00Z" }), now) &&
    !holdEndsToday(invite("b", "c", { expires_at: "2026-11-27T05:30:00Z" }), now) &&
    !holdEndsToday(invite("c", "c", { expires_at: "2026-11-26T14:00:00Z" }), now)
  );
  check("today and tomorrow turn over at Toronto's midnight, not UTC's", () => {
    // 23:30 Toronto on Nov 26 is already Nov 27 in UTC.
    const late = deskFrom({ now: new Date("2026-11-27T04:30:00Z"), cohorts: { ok: true, data: { ...cohortSide, invites: [] } }, assessments: { ok: true, data: bookings } });
    return late.lines.some((l) => l.key === "today" && l.count === 1) && late.lines.some((l) => l.key === "tomorrow" && l.count === 2);
  });
  check("each amount is the cohort page's own figure, listed, never added up", () =>
    amountsDue([19000]) === "$190 due" && amountsDue([19000, 17000]) === "$190 and $170 due" && amountsDue([19000, 17000, 17050]) === "$190, $170 and $170.50 due"
  );
  check("the cohort page and the desk write an amount with one function", () =>
    /adminMoney as money,/.test(detailSrc) && !/function money\(/.test(detailSrc) && /adminMoney/.test(read("src/lib/adminDesk.ts"))
  );
  check("the desk works out no amount: it asks the function the cohort's page shows it with", () => {
    const reads = read("src/lib/adminDeskReads.ts");
    return /await inviteAmountDueCents\(invite, cohort\)/.test(reads) && !/priceCents|creditCents|amountDueCents\(\s*cohort/.test(code(reads).replace(/inviteAmountDueCents|amountDueCents\.set|amountDueCents,|const amountDueCents/g, ""));
  });
  const noAmount = deskFrom({
    now,
    cohorts: { ok: true, data: { ...cohortSide, amountDueCents: new Map<string, number | null>([["t1", 19000], ["t2", null], ["t3", 17000]]) } },
    assessments: { ok: true, data: [] },
  });
  check("an amount that could not be read: that cohort shows its count alone", () =>
    noAmount.lines[0].count === 2 && noAmount.lines[0].detail === "Saturday 12pm Intermediate" && noAmount.lines[1].detail === "Sunday 4pm Beginner · $170 due"
  );

  const nothing = deskFrom({ now, cohorts: { ok: true, data: { cohorts: cohortSide.cohorts, invites: [], amountDueCents: new Map() } }, assessments: { ok: true, data: [] } });
  check("nothing waiting: the one quiet line", () => nothing.quiet && nothing.lines.length === 0 && words(render(createElement(WaitingOnYou, { desk: nothing }))) === `Waiting on you ${DESK_QUIET_LINE}`);
  const halfDown = deskFrom({ now, cohorts: { ok: false }, assessments: { ok: true, data: [] } });
  const allDown = deskFrom({ now, cohorts: { ok: false }, assessments: { ok: false } });
  check("a failed read: a line that says it couldn't check, never that nothing waits", () => {
    const half = words(render(createElement(WaitingOnYou, { desk: halfDown })));
    const all = words(render(createElement(WaitingOnYou, { desk: allDown })));
    return (
      !halfDown.quiet &&
      !allDown.quiet &&
      half === `Waiting on you ${DESK_COHORTS_GAP} Open Cohorts` &&
      all === `Waiting on you ${DESK_COHORTS_GAP} Open Cohorts ${DESK_ASSESSMENTS_GAP} Open Assessments` &&
      !half.includes(DESK_QUIET_LINE) &&
      !all.includes(DESK_QUIET_LINE)
    );
  });
  const mixed = deskFrom({ now, cohorts: { ok: false }, assessments: { ok: true, data: bookings } });
  check("the side that answered still shows its lines beside the other's couldn't-check line", () => mixed.lines.length === 3 && mixed.gaps.length === 1 && !mixed.quiet);

  const deskHtml = render(createElement(WaitingOnYou, { desk }));
  check("each line is one link: its count, its words, its page", () => {
    const links = [...deskHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => `${words(m[2]).replace(/ →$/, "")} -> ${m[1]}`);
    return JSON.stringify(links) === JSON.stringify(expected.map((e) => e.replace(" | ", " ")));
  });

  // With no database configured (as here), both sides read as "couldn't check".
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const unconfigured = await readAdminDesk({ id: "coach", email: "coach@example.com" }, now);
  check("with nothing to read from, the desk says it couldn't check", () => !unconfigured.quiet && unconfigured.gaps.length === 2 && unconfigured.lines.length === 0);

  const pageSrc = read("src/app/admin/page.tsx");
  const readsSrc = read("src/lib/adminDeskReads.ts");
  check("the page reads the desk only after its gate, with the admin the gate returned", () => {
    const gate = pageSrc.indexOf("const admin = await getAdminUser();");
    const refuse = pageSrc.indexOf('if (!admin) redirect(await adminRefusedRedirect("/admin"));');
    const desk = pageSrc.indexOf("const desk = await readAdminDesk(admin);");
    return gate > 0 && refuse > gate && desk > refuse && (pageSrc.match(/readAdminDesk\(/g) ?? []).length === 1;
  });
  check("the reads are server-only, take the admin, and write nothing", () =>
    /^import "server-only";/.test(readsSrc) &&
    /export async function readAdminDesk\(admin: AdminUser,/.test(readsSrc) &&
    !/\.(update|insert|upsert|delete|rpc)\(/.test(code(readsSrc))
  );
  check("no new API route serves the desk", () => !files("src/app/api").some((p) => /desk|waiting/i.test(p)));
  check("the five cards are under the list, unchanged", () =>
    /<WaitingOnYou desk=\{desk\} \/>\s*<div className="grid gap-3">\s*\{CARDS\.map/.test(pageSrc) && (pageSrc.match(/href: "\/admin\//g) ?? []).length === 5
  );

  console.log(failed === 0 ? "\nAll coach-tools checks passed." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();

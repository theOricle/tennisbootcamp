// Run from project root: npx tsx src/scripts/test-open-draft.ts
//
// Pins backlog #95: the coach opens a draft cohort to the public from its
// admin page, without inviting anyone, and takes an open cohort back to draft
// while nobody holds a seat in it.
//   1. the seat records: an invite held (invited) or paid, an enrollment row
//      paid, a paid row on the Sheet. Nothing else holds a seat;
//   2. the rules, as a table: status × visibility × first class past or ahead
//      × seats held or paid × the move. Open only a public draft whose first
//      class is ahead, so only when the site would then list it; back to
//      draft only an open cohort with no seat held or paid; every other
//      request refused with its line;
//   3. the API's move, run on a fake store for every row of that table: a
//      refusal writes nothing, an allowed move is one compare-and-set from
//      the status it was decided on and then the pages refresh; a lost race,
//      a database error or seats that can't be read write nothing more;
//   4. the route and the server: the two actions go through that move;
//      set_status sets running, completed and cancelled only, as before; no
//      other action sets a status of its own;
//   5. the page: each control in its own state only (rendered), in the style
//      of "Reopen cohort", a refusal in the status line;
//   6. the label: inviting reads "Open", on the admin screens only.
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COHORT_TOTAL_CENTS, COHORT_WEEKS } from "../content/programs";
import {
  BACK_TO_DRAFT_BUTTON,
  DIRECT_STATUSES,
  DIRECT_STATUS_ERROR,
  OPEN_BUTTON,
  OPEN_LINE,
  OPENING_ERRORS,
  OPENING_MOVES,
  PRIVATE_LINE,
  SEAT_ENROLLMENT_STATUSES,
  SEAT_INVITE_STATUSES,
  decideOpening,
  directStatusRefusal,
  firstClassAhead,
  openingControl,
  runOpeningMove,
  seatHeldOrPaid,
  type OpeningControl,
  type OpeningStore,
  type SeatRecords,
} from "../lib/cohortOpening";
import { isCohortPublic, torontoNow } from "../lib/cohortVisibility";
import { paidSeatRows, seatsFromSnapshot } from "../lib/seatCount";
import { COHORT_STATUS_LABELS, statusLabel } from "../lib/adminLabels";
import { OpeningControls } from "../app/admin/cohorts/[id]/AdminCohortDetailClient";
import type { Cohort, CohortDbStatus, SessionSlot } from "../types/cohort";

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
/** The text of some markup, its entities read back. */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// The moment the table is read at, and two blocks around it. Classes are on
// Saturdays at 3pm; the start dates are the Mondays the coach typed.
const NOW = "2027-01-12T10:00";
const SATURDAY: SessionSlot = { day: "Sat", start: "15:00", end: "16:00" };
const AHEAD: Partial<Cohort> = { startDate: "2027-01-11", sessions: [SATURDAY] }; // first class Sat Jan 16, 3pm
const PAST: Partial<Cohort> = { startDate: "2027-01-04", sessions: [SATURDAY] }; // first class Sat Jan 9, 3pm

const cohort = (over: Partial<Cohort> = {}): Cohort => ({
  id: "winter-adult",
  programId: "bootcamps",
  locationId: "",
  label: "Winter Adult",
  startDate: "2027-01-11",
  endDate: "",
  weeks: COHORT_WEEKS,
  sessions: [SATURDAY],
  capacityMin: 3,
  capacityMax: 8,
  priceCents: COHORT_TOTAL_CENTS,
  currency: "CAD",
  status: "upcoming",
  levelMin: 1,
  levelMax: 1.5,
  visibility: "public",
  dbStatus: "draft",
  ...over,
});

const NONE: SeatRecords = { inviteStatuses: [], enrollmentStatuses: [], sheetPaidRows: 0 };
/** Every seat case the enrollment path can leave: its name, its records, and whether a seat is held or paid. */
const SEATS: [string, SeatRecords, boolean][] = [
  ["no records at all", NONE, false],
  ["a Sheet that isn't set up, and nothing else", { ...NONE, sheetPaidRows: null }, false],
  ["an expired invite and a declined one", { ...NONE, inviteStatuses: ["expired", "declined"] }, false],
  ["a checkout never paid, a test payment, a refund and a dispute", { ...NONE, enrollmentStatuses: ["pending", "test_paid", "refunded", "disputed"] }, false],
  ["an invitation's hold", { ...NONE, inviteStatuses: ["expired", "invited"] }, true],
  ["an e-transfer on its way (its hold row reads invited)", { ...NONE, inviteStatuses: ["invited"], enrollmentStatuses: ["pending"] }, true],
  ["a paid invite", { ...NONE, inviteStatuses: ["paid"] }, true],
  ["a card payment with no invite (its enrollment row reads paid)", { ...NONE, enrollmentStatuses: ["test_paid", "paid"] }, true],
  ["a paid row on the Sheet alone", { ...NONE, sheetPaidRows: 1 }, true],
];

const STATUSES: (CohortDbStatus | undefined)[] = ["draft", "inviting", "confirmed", "running", "completed", "cancelled", undefined];
const VISIBILITIES: Cohort["visibility"][] = ["public", "private", undefined];
const TIMES: [string, Partial<Cohort>, boolean][] = [
  ["first class ahead", AHEAD, true],
  ["first class past", PAST, false],
];
const MOVES = ["open", "back_to_draft", "set_status", "reopen", "", "draft", "inviting", "Open", "back-to-draft"];

type Row = {
  name: string;
  c: Cohort;
  status: CohortDbStatus | undefined;
  visibility: Cohort["visibility"];
  ahead: boolean;
  records: SeatRecords;
  held: boolean;
  move: string;
};
const TABLE: Row[] = [];
for (const status of STATUSES)
  for (const visibility of VISIBILITIES)
    for (const [timeName, time, ahead] of TIMES)
      for (const [seatName, records, held] of SEATS)
        for (const move of MOVES)
          TABLE.push({
            name: `${status ?? "no status"}, ${visibility ?? "no visibility"}, ${timeName}, ${seatName}, "${move}"`,
            c: cohort({ ...time, dbStatus: status, visibility }),
            status,
            visibility,
            ahead,
            records,
            held,
            move,
          });

/** The table's answer, written out: the only two moves allowed, and the line every refusal reads. */
function expected(row: Row): { ok: true; to: "inviting" | "draft" } | { ok: false; error: string } {
  if (!row.status) return { ok: false, error: OPENING_ERRORS.notFound };
  if (row.move === "open") {
    if (row.status !== "draft") return { ok: false, error: OPENING_ERRORS.notDraft };
    if (row.visibility !== "public") return { ok: false, error: OPENING_ERRORS.private };
    if (!row.ahead) return { ok: false, error: OPENING_ERRORS.started };
    return { ok: true, to: "inviting" };
  }
  if (row.move === "back_to_draft") {
    if (row.status !== "inviting") return { ok: false, error: OPENING_ERRORS.notOpen };
    if (row.held) return { ok: false, error: OPENING_ERRORS.seatTaken };
    return { ok: true, to: "draft" };
  }
  return { ok: false, error: OPENING_ERRORS.unknown };
}

// ── 1. The seat records ──────────────────────────────────────────────────────
console.log("1. The seat records: a hold or a paid seat, wherever the enrollment path wrote it");
{
  for (const [name, records, held] of SEATS) {
    check(`${name}: ${held ? "a seat is held or paid" : "no seat"}`, seatHeldOrPaid(records) === held);
  }
  check("the statuses that hold a seat: an invite invited or paid, an enrollment row paid", SEAT_INVITE_STATUSES.join() === "invited,paid" && SEAT_ENROLLMENT_STATUSES.join() === "paid");

  // The Sheet's paid rows, counted by the rule the sign-up page's seat count reads.
  const snapshot = {
    header: ["timestamp", "cohort_id", "status"],
    rows: [
      ["t", "winter-adult", "paid"],
      ["t", "winter-adult", "pending"],
      ["t", "winter-adult", "pending_etransfer"],
      ["t", "winter-adult", "test_paid"],
      ["t", "winter-adult", "refunded"],
      ["t", "spring-youth", "paid"],
      ["t", "winter-adult", "paid"],
    ],
  };
  check("the Sheet: this cohort's paid rows only (no pending, e-transfer on its way, test payment or refund)", paidSeatRows(snapshot, "winter-adult") === 2 && paidSeatRows(snapshot, "spring-youth") === 1 && paidSeatRows(snapshot, "nobody") === 0);
  check("…an empty tab counts none, and a tab whose columns can't be found can't be counted", paidSeatRows({ header: [], rows: [] }, "winter-adult") === 0 && paidSeatRows({ header: ["x"], rows: [["y"]] }, "winter-adult") === null);
  check("…the seat count reads the same rule: capacity minus those rows, as before", seatsFromSnapshot(snapshot, "winter-adult", 8) === 6 && seatsFromSnapshot(snapshot, "winter-adult", 1) === 0 && seatsFromSnapshot({ header: [], rows: [] }, "winter-adult", 8) === 8 && seatsFromSnapshot({ header: ["x"], rows: [["y"]] }, "winter-adult", 8) === null);
}

// ── 2. The rules ─────────────────────────────────────────────────────────────
console.log("2. The rules: status × visibility × first class past or ahead × seats × the move");
{
  check("the table covers every status, visibility, time, seat case and move", TABLE.length === STATUSES.length * VISIBILITIES.length * TIMES.length * SEATS.length * MOVES.length && TABLE.length > 3000, String(TABLE.length));
  check("the two moves, by the API's action names", OPENING_MOVES.join() === "open,back_to_draft");
  const wrong = TABLE.filter((row) => {
    const got = decideOpening({ move: row.move, cohort: row.c, seatHeldOrPaid: row.held, when: NOW });
    const want = expected(row);
    return got.ok !== want.ok || (got.ok && want.ok ? got.to !== want.to : !got.ok && !want.ok && got.error !== want.error);
  });
  check("every row decides as the table says, each refusal with its own line", wrong.length === 0, wrong.slice(0, 5).map((r) => r.name).join(" | "));
  const allowed = TABLE.filter((row) => decideOpening({ move: row.move, cohort: row.c, seatHeldOrPaid: row.held, when: NOW }).ok);
  check(
    "only two moves are ever allowed: a public draft whose first class is ahead opens (whatever its records), and an open cohort with no seat held or paid goes back to draft (public or private, its first class past or ahead)",
    allowed.every((r) => (r.move === "open" && r.status === "draft" && r.visibility === "public" && r.ahead) || (r.move === "back_to_draft" && r.status === "inviting" && !r.held)) &&
      allowed.filter((r) => r.move === "open").length === SEATS.length &&
      allowed.filter((r) => r.move === "back_to_draft").length === VISIBILITIES.length * TIMES.length * SEATS.filter(([, , held]) => !held).length
  );
  check("a draft that is private, past, or both never opens; nor does a cancelled, confirmed, running or completed cohort", !allowed.some((r) => r.move === "open" && (r.visibility !== "public" || !r.ahead || r.status !== "draft")));
  check("a cohort with any seat held or paid never goes back to draft", !allowed.some((r) => r.move === "back_to_draft" && r.held));

  // The site's own rule decides what "open" means: it opens only when the
  // site would then list it, and back to draft always hides it.
  const opened = allowed.filter((r) => r.move === "open");
  check("an allowed open is exactly when the site would then list the cohort (isCohortPublic, unchanged)", TABLE.filter((r) => r.move === "open").every((r) => decideOpening({ move: "open", cohort: r.c, when: NOW }).ok === (r.status === "draft" && r.visibility === "public" && isCohortPublic({ ...r.c, dbStatus: "inviting" }, NOW))) && opened.every((r) => isCohortPublic({ ...r.c, dbStatus: "inviting" }, NOW)));
  check("…and no draft is ever listed: back to draft hides every cohort it moves", allowed.filter((r) => r.move === "back_to_draft").every((r) => !isCohortPublic({ ...r.c, dbStatus: "draft" }, NOW)));
  check("seats left out count as held: back to draft is refused without them", !decideOpening({ move: "back_to_draft", cohort: cohort({ dbStatus: "inviting" }), when: NOW }).ok);

  // The first class, to the minute, on Toronto's clock.
  const block = cohort(AHEAD);
  const opens = (when?: string) => decideOpening({ move: "open", cohort: block, when }).ok;
  check("a start date typed before today with its first class still ahead opens (the class, not the typed date, counts)", opens("2027-01-12") && opens(NOW));
  check("on the day of the first class it opens until the class begins: 2:59pm yes, 3:00pm no", opens("2027-01-16T14:59") && !opens("2027-01-16T15:00") && !opens("2027-01-16T15:30") && !opens("2027-01-17"));
  check("…in Toronto time: 19:59 UTC on Jan 16 is 2:59pm there, 20:00 UTC is 3pm", opens(torontoNow(new Date("2027-01-16T19:59:00Z"))) && !opens(torontoNow(new Date("2027-01-16T20:00:00Z"))));
  check("…and left out, the moment is now", decideOpening({ move: "open", cohort: cohort({ startDate: "2099-01-05" }) }).ok && !decideOpening({ move: "open", cohort: cohort({ startDate: "2020-01-06" }) }).ok);
  check("firstClassAhead reads the site's rule for every status", STATUSES.every((s) => firstClassAhead(cohort({ ...AHEAD, dbStatus: s }), NOW) && !firstClassAhead(cohort({ ...PAST, dbStatus: s }), NOW)));
  const source = read("src/lib/cohortOpening.ts");
  check("the rules read the site's own (isCohortRenderable) and keep no clock or date rule of their own", source.includes('import { isCohortRenderable } from "@/lib/cohortVisibility";') && !/toLocale|generateSessionDates|new Date\(|Date\.now/.test(source));

  check("the refusal lines, plain and short", [
    OPENING_ERRORS.notDraft === "Only a draft can open.",
    OPENING_ERRORS.private === PRIVATE_LINE,
    OPENING_ERRORS.started === "Its first class has started, so it can't open.",
    OPENING_ERRORS.notOpen === "Only an open cohort can go back to draft.",
    OPENING_ERRORS.seatTaken === "A player holds or has paid for a seat, so it can't go back to draft.",
    OPENING_ERRORS.seatsUnread === "Couldn't check the seats. Try again.",
  ].every(Boolean));
  const NEW_LINES = [OPEN_LINE, PRIVATE_LINE, OPENING_ERRORS.notDraft, OPENING_ERRORS.started, OPENING_ERRORS.notOpen, OPENING_ERRORS.seatTaken, OPENING_ERRORS.seatsUnread, DIRECT_STATUS_ERROR];
  check("…and every new line says nothing the voice brief bans: no exclamation, no dash, no salesy word", NEW_LINES.every((l) => !/[!—–]|journey|seamless|unlock|really|actually|\bjust\b/i.test(l)));
  check("…the lost race reads the line every other status change on the page reads", read("src/lib/cohortActions.ts").includes(`return { ok: false, error: "${OPENING_ERRORS.changed}" };`));
}

// ── 3. The API's move ────────────────────────────────────────────────────────
console.log("3. The API's move on a fake store: a refusal writes nothing, an allowed move is one compare-and-set");

type Log = { seatReads: number; writes: [string, string, string][]; revalidated: number };
function fakeStore(
  c: Cohort,
  records: SeatRecords | null | "throws",
  opts: { liveStatus?: CohortDbStatus; dbError?: string } = {}
): { store: OpeningStore; log: Log; status: () => CohortDbStatus | undefined } {
  const log: Log = { seatReads: 0, writes: [], revalidated: 0 };
  // What the database holds now: the cohort as read, unless something moved it since.
  let status = opts.liveStatus ?? c.dbStatus;
  const store: OpeningStore = {
    readCohort: async (id) => (id === c.id ? { ...c } : undefined),
    readSeatRecords: async () => {
      log.seatReads++;
      if (records === "throws") throw new Error("records unreachable");
      return records;
    },
    setStatusIf: async (id, from, to) => {
      log.writes.push([id, from, to]);
      if (opts.dbError) return { moved: false, error: opts.dbError };
      if (id !== c.id || status !== from) return { moved: false };
      status = to as CohortDbStatus;
      return { moved: true };
    },
    revalidate: () => {
      log.revalidated++;
    },
  };
  return { store, log, status: () => status };
}

void (async () => {
  {
    const wrong: string[] = [];
    const wrongReads: string[] = [];
    for (const row of TABLE) {
      const { store, log, status } = fakeStore(row.c, row.records);
      const result = await runOpeningMove(store, { cohortId: row.c.id, move: row.move, when: NOW });
      const want = expected(row);
      const good = want.ok
        ? result.ok && result.status === want.to && log.writes.length === 1 && log.writes[0][0] === row.c.id && log.writes[0][1] === row.status && log.writes[0][2] === want.to && log.revalidated === 1 && status() === want.to
        : !result.ok && result.error === want.error && log.writes.length === 0 && log.revalidated === 0 && status() === row.status;
      if (!good) wrong.push(`${row.name}: ${JSON.stringify(result)} ${JSON.stringify(log)}`);
      if (log.seatReads !== (row.move === "back_to_draft" && row.status === "inviting" ? 1 : 0)) wrongReads.push(`${row.name}: ${log.seatReads} reads`);
    }
    check("every row of the table: refused with its line and nothing written, or one compare-and-set from the status it was decided on, then the pages refresh", wrong.length === 0, wrong.slice(0, 3).join(" | "));
    check("…the seats are read once to take an open cohort back to draft, and for nothing else", wrongReads.length === 0, wrongReads.slice(0, 3).join(" | "));

    const unknown = fakeStore(cohort(), NONE);
    const missing = await runOpeningMove(unknown.store, { cohortId: "no-such-cohort", move: "open", when: NOW });
    check("a cohort that isn't there: not found, nothing read or written", !missing.ok && missing.error === OPENING_ERRORS.notFound && unknown.log.writes.length === 0 && unknown.log.seatReads === 0);

    // The page judges on its invites and card payments; the API reads the
    // Sheet's paid rows as well, so a seat the page cannot see still holds.
    const open = cohort({ dbStatus: "inviting" });
    check("the page may offer Back to draft on what it has read…", openingControl(open, { inviteStatuses: [], enrollmentStatuses: [], sheetPaidRows: null }, NOW) === "back_to_draft");
    const sheetOnly = fakeStore(open, { inviteStatuses: [], enrollmentStatuses: [], sheetPaidRows: 1 });
    const refused = await runOpeningMove(sheetOnly.store, { cohortId: open.id, move: "back_to_draft", when: NOW });
    check("…and the API still refuses it on a paid row the Sheet alone holds, writing nothing", !refused.ok && refused.error === OPENING_ERRORS.seatTaken && sheetOnly.log.writes.length === 0 && sheetOnly.status() === "inviting");

    for (const [name, records] of [["can't be read", null], ["throw", "throws"]] as const) {
      const s = fakeStore(open, records);
      const r = await runOpeningMove(s.store, { cohortId: open.id, move: "back_to_draft", when: NOW });
      check(`seats that ${name}: refused (never guessed as none), nothing written`, !r.ok && r.error === OPENING_ERRORS.seatsUnread && s.log.writes.length === 0 && s.log.revalidated === 0 && s.status() === "inviting");
    }

    // A lost race: read as a draft, but an invitation opened it before the write.
    const raced = fakeStore(cohort(), NONE, { liveStatus: "inviting" });
    const lost = await runOpeningMove(raced.store, { cohortId: "winter-adult", move: "open", when: NOW });
    check("a lost race: the compare-and-set on draft finds it moved, says so, and nothing refreshes", !lost.ok && lost.error === OPENING_ERRORS.changed && raced.log.writes.length === 1 && raced.log.writes[0][1] === "draft" && raced.log.revalidated === 0 && raced.status() === "inviting");
    const cancelledSince = fakeStore(open, NONE, { liveStatus: "cancelled" });
    const late = await runOpeningMove(cancelledSince.store, { cohortId: open.id, move: "back_to_draft", when: NOW });
    check("…an open cohort cancelled since it was read stays cancelled", !late.ok && late.error === OPENING_ERRORS.changed && cancelledSince.status() === "cancelled");
    const broken = fakeStore(cohort(), NONE, { dbError: "permission denied" });
    const failedWrite = await runOpeningMove(broken.store, { cohortId: "winter-adult", move: "open", when: NOW });
    check("a database error: its message, and nothing refreshes", !failedWrite.ok && failedWrite.error === "permission denied" && broken.log.revalidated === 0);
  }

  // ── 4. The route and the server ──────────────────────────────────────────
  console.log("4. The route and the server: the two actions through the guarded move; set_status as before");
  {
    const route = read("src/app/api/admin/cohorts/[id]/route.ts");
    const branchAt = route.indexOf('if (action === "open" || action === "back_to_draft") {');
    const branch = route.slice(branchAt, route.indexOf("\n    }\n", branchAt));
    check(
      "open and back_to_draft go through moveCohortOpening and answer its refusal with a 400",
      branchAt > 0 &&
        branch.includes("const result = await moveCohortOpening(id, action);") &&
        branch.includes("if (!result.ok) {\n        return NextResponse.json({ error: result.error }, { status: 400 });") &&
        branch.includes("return NextResponse.json({ ok: true, status: result.status });") &&
        (route.match(/moveCohortOpening\(/g) ?? []).length === 1,
      branch
    );

    const setStatus = route.slice(route.indexOf('if (action === "set_status") {'), route.indexOf('if (action === "reopen") {'));
    check(
      "set_status refuses every status it doesn't set before it writes",
      setStatus.includes("const refused = directStatusRefusal(status);") &&
        setStatus.indexOf("directStatusRefusal(status)") < setStatus.indexOf("await updateCohort(id, { status })") &&
        setStatus.includes("return NextResponse.json({ error: refused }, { status: 400 });")
    );
    check("…and sets running, completed and cancelled only, as before (sessions still made for running)", DIRECT_STATUSES.join() === "running,completed,cancelled" && setStatus.includes('if (["confirmed", "running"].includes(status)) {\n        await ensureCohortSessions(id);'));
    const KNOWN = ["draft", "inviting", "confirmed", "running", "completed", "cancelled"];
    check("…draft, open and confirmed refused with a plain line; the other three let through", KNOWN.every((s) => directStatusRefusal(s) === (DIRECT_STATUSES.includes(s) ? null : DIRECT_STATUS_ERROR)) && ["draft", "inviting", "confirmed"].every((s) => directStatusRefusal(s) === "That status can't be set directly."));
    check("…an unknown status is still refused first, as before", setStatus.indexOf('return NextResponse.json({ error: "Unknown status." }, { status: 400 });') > 0 && setStatus.indexOf("Unknown status.") < setStatus.indexOf("directStatusRefusal("));

    const update = route.slice(route.indexOf('if (action === "update") {'), route.indexOf("const result = await updateCohort(id, patch"));
    check("the update action carries no status of its own", update.length > 200 && !update.includes('"status"'));
    check("the route writes nothing itself: every write is a cohort action's", !/createServiceClient|\.from\("cohorts"\)/.test(route));
    check("Reopen cohort is unchanged: it still goes to reopenCohort", route.includes('if (action === "reopen") {\n      const result = await reopenCohort(id);'));

    const actions = read("src/lib/cohortActions.ts");
    const moveAt = actions.indexOf("export async function moveCohortOpening(");
    const move = actions.slice(moveAt, actions.indexOf("\n}\n", moveAt));
    check(
      "the server's move: the rules' order (runOpeningMove), the cohort read by id, and a compare-and-set on the status it was decided from",
      moveAt > 0 &&
        move.includes("return runOpeningMove(") &&
        move.includes("readCohort: getCohortById,") &&
        move.includes("readSeatRecords: cohortSeatRecords,") &&
        move.includes('.from("cohorts")\n          .update({ status: to })\n          .eq("id", id)\n          .eq("status", from)\n          .select("id")\n          .maybeSingle();'),
      move
    );
    check("…then the public pages refresh, and nobody is emailed", move.includes("revalidate: revalidateCohortPages,") && !/Email\(/.test(move));
    const seatsAt = actions.indexOf("async function cohortSeatRecords(");
    const seats = actions.slice(seatsAt, actions.indexOf("\n}\n", seatsAt));
    check(
      "the seat records it reads: every invite's status, every enrollment row's status, the Sheet's paid rows",
      seatsAt > 0 &&
        seats.includes('supabase.from("cohort_invites").select("status").eq("cohort_id", cohort.id),') &&
        seats.includes('supabase.from("enrollments").select("status").eq("cohort_id", cohort.id),') &&
        seats.includes("const sheet = await readEnrollmentSheet();") &&
        seats.includes("paidSeatRows(sheet.snapshot, cohort.id)"),
      seats
    );
    check("…none at all when one can't be read (the guard then refuses), and it writes nothing", seats.includes("if (invites.error || enrollments.error) {") && seats.includes('if (sheet.status === "error") return null;') && seats.includes('if (sheet.status === "ok" && sheetPaidRows === null) return null;') && !/\.(update|insert|delete|upsert|append)\(/.test(seats));
    check("an invitation still opens a draft (the private line's promise): the first one sent moves it to inviting", actions.includes('if (sent > 0 && cohort.dbStatus === "draft") {\n    await supabase.from("cohorts").update({ status: "inviting" }).eq("id", cohortId);'));
  }

  // ── 5. The page ──────────────────────────────────────────────────────────
  console.log("5. The page: each control in its own state only");
  {
    const markup = (control: OpeningControl, busy = false) =>
      renderToStaticMarkup(createElement(OpeningControls, { control, busy, onMove: () => {} }));

    // The state table: what the page shows for each status, visibility, time and seat case.
    const wantControl = (status: CohortDbStatus | undefined, visibility: Cohort["visibility"], ahead: boolean, held: boolean): OpeningControl => {
      if (status === "draft" && visibility === "public" && ahead) return "open";
      if (status === "draft" && visibility === "private" && ahead) return "private";
      if (status === "inviting" && !held) return "back_to_draft";
      return null;
    };
    const wrong: string[] = [];
    for (const status of STATUSES)
      for (const visibility of VISIBILITIES)
        for (const [timeName, time, ahead] of TIMES)
          for (const [seatName, records, held] of SEATS) {
            const got = openingControl(cohort({ ...time, dbStatus: status, visibility }), records, NOW);
            const html = text(markup(got));
            const want = wantControl(status, visibility, ahead, held);
            const shows = { open: html.includes(OPEN_BUTTON), line: html.includes(OPEN_LINE), private: html.includes(PRIVATE_LINE), back: html.includes(BACK_TO_DRAFT_BUTTON) };
            const right =
              got === want &&
              shows.open === (want === "open") &&
              shows.line === (want === "open") &&
              shows.private === (want === "private") &&
              shows.back === (want === "back_to_draft");
            if (!right) wrong.push(`${status ?? "no status"}, ${visibility ?? "no visibility"}, ${timeName}, ${seatName}: ${got} ${JSON.stringify(shows)}`);
          }
    check("every state shows its own control and no other", wrong.length === 0, wrong.slice(0, 4).join(" | "));
    check("…a public draft whose first class is ahead: the button and its line", openingControl(cohort(AHEAD), NONE, NOW) === "open");
    check("…a private draft: the line alone, no button", openingControl(cohort({ ...AHEAD, visibility: "private" }), NONE, NOW) === "private" && !markup("private").includes("<button"));
    check("…a draft whose first class has passed: nothing, public or private", openingControl(cohort(PAST), NONE, NOW) === null && openingControl(cohort({ ...PAST, visibility: "private" }), NONE, NOW) === null && markup(null) === "");
    check("…an open cohort with no seat held or paid: Back to draft; with one, nothing", openingControl(cohort({ dbStatus: "inviting" }), NONE, NOW) === "back_to_draft" && SEATS.filter(([, , held]) => held).every(([, records]) => openingControl(cohort({ dbStatus: "inviting" }), records, NOW) === null));
    check("…confirmed, running, completed and cancelled: nothing new", (["confirmed", "running", "completed", "cancelled"] as const).every((s) => openingControl(cohort({ ...AHEAD, dbStatus: s }), NONE, NOW) === null));

    const open = markup("open");
    check("the open control: one button, then its line under it", (open.match(/<button/g) ?? []).length === 1 && text(open) === `${OPEN_BUTTON} ${OPEN_LINE}` && open.indexOf("</button>") < open.indexOf(OPEN_LINE.slice(0, 20)));
    check("…the line is the button's description, small and muted", open.includes('aria-describedby="opening-line"') && open.includes('<p id="opening-line" class="mt-2 text-xs text-white/60">'));
    check("the private line, in the same small type", markup("private") === `<p class="mb-1 basis-full text-xs text-white/60">${PRIVATE_LINE}</p>`);
    const back = markup("back_to_draft");
    check("Back to draft: one button and no line", (back.match(/<button/g) ?? []).length === 1 && text(back) === BACK_TO_DRAFT_BUTTON);
    check("the words: Open to the public, Back to draft, and the line under the first", OPEN_BUTTON === "Open to the public" && BACK_TO_DRAFT_BUTTON === "Back to draft" && OPEN_LINE === "A draft is hidden from the site. Once it's open, the site lists it with an Enroll button until its first class." && PRIVATE_LINE === "A private cohort opens when you send its first invitation.");

    const page = read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx");
    const reopen = /onClick=\{\(\) => void postStatus\(\{ action: "reopen" \}\)\}\s*className="([^"]+)"/.exec(page)?.[1] ?? "";
    const classes = (html: string) => [...html.matchAll(/<button[^>]*class="([^"]+)"/g)].map((m) => m[1]);
    check("both buttons wear the Reopen cohort button's style", reopen.length > 40 && [...classes(open), ...classes(back)].every((c) => c === reopen) && classes(open).length === 1 && classes(back).length === 1, reopen);
    check("…each its own row, across the status controls, before the other buttons", open.startsWith('<div class="mb-1 basis-full">') && back.startsWith('<div class="basis-full">'));
    check("…and disabled while a status change is under way", (markup("open", true).match(/disabled=""/g) ?? []).length === 1 && (markup("back_to_draft", true).match(/disabled=""/g) ?? []).length === 1 && !markup("open").includes('disabled=""') && !markup("back_to_draft").includes('disabled=""'));

    // A click names its own move.
    const moves: string[] = [];
    const findButtons = (node: unknown): { props: { onClick: () => void } }[] => {
      if (!node || typeof node !== "object") return [];
      if (Array.isArray(node)) return node.flatMap(findButtons);
      const el = node as ReactElement<{ children?: unknown; onClick?: () => void }>;
      return el.type === "button" ? [el as { props: { onClick: () => void } }] : findButtons(el.props?.children);
    };
    for (const control of ["open", "back_to_draft"] as const) {
      for (const b of findButtons(OpeningControls({ control, busy: false, onMove: (m) => moves.push(m) }))) b.props.onClick();
    }
    check("a click sends its move: open, back_to_draft", moves.join() === "open,back_to_draft", moves.join());

    check(
      "the page reads the rules on its own invites and card payments (the API adds the Sheet)",
      page.includes("const opening = openingControl(cohort, {\n    inviteStatuses: invites.map((i) => i.status),\n    enrollmentStatuses: (detail.payments ?? []).map((p) => p.status),\n    sheetPaidRows: null,\n  });")
    );
    check(
      "the row sits first in the status controls, and posts its move through the status path",
      page.includes('{/* Status controls */}\n      <div className="flex flex-wrap gap-2">\n        <OpeningControls\n          control={opening}\n          busy={statusBusy}\n          onMove={(move) => void postStatus({ action: move })}\n        />\n        {dbStatus === "confirmed" && (')
    );
    check("…whose refusal shows in the existing status line", page.includes('setStatusError(typeof data.error === "string" ? data.error : "That didn\'t save. Try again.");') && page.includes("{statusError && ("));
    check("the existing controls are unchanged: Mark running, Mark completed, Cancel cohort…, Reopen cohort", ["Mark running", "Mark completed", "Cancel cohort…", '{statusBusy ? "Reopening…" : "Reopen cohort"}'].every((s) => page.includes(s)));
  }

  // ── 6. The label ─────────────────────────────────────────────────────────
  console.log("6. The label: inviting reads Open, on the admin screens only");
  {
    check("inviting reads Open; every other status as before", ["draft", "inviting", "confirmed", "running", "completed", "cancelled"].map((s) => statusLabel(COHORT_STATUS_LABELS, s)).join() === "Draft,Open,Confirmed,Running,Completed,Cancelled");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(join(ROOT, "src"));
    const readers = files
      .filter((f) => !f.startsWith(join(ROOT, "src", "scripts") + sep) && readFileSync(f, "utf8").includes("COHORT_STATUS_LABELS"))
      .map((f) => relative(ROOT, f).split(sep).join("/"));
    check("the labels are read by admin screens only", readers.length > 1 && readers.every((f) => f.startsWith("src/app/admin/") || f === "src/lib/adminLabels.ts"), readers.join(", "));
  }

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll open-a-draft checks passed.");
})();

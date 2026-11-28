// Run from project root: npx tsx src/scripts/test-dashboard-one-look.ts
//
// Pins backlog #105: the dashboard in the site's one look.
//   1. No newsletter line on the signed-in pages (the dashboard, the profile,
//      enrolling, the admin); every public page keeps it, with its anchor.
//   2. The availability grid's legend reads 12-hour times ("8am–12pm",
//      "12–4pm", "4–8pm"), as display only.
//   3. Nothing stored changed: the bands' keys and hours, the grid's stored
//      shape, the Sheet's availability cell and the legacy slots the quiz
//      sends are what they were, and no writer reads the legend's label.
//   4. The page, rendered, in every state: the welcome as a plain heading,
//      one next-step card, a waiting e-transfer as Amount, Send to, Message,
//      "Coming up", one card per group with each player's own status, groups
//      with dates as the /programs cards (outline "Enroll"), one players
//      section, suggestions only when no group with dates is listed. One
//      lime button at most, no capital label, no arrow after a link's words,
//      the group's name and never the coach's block label (the e-transfer
//      message keeps it: payments are matched by it).
//   5. A full block's "Notify me" still leads to a newsletter line.
// Every check catches its own error, so each reports on its own. Exits
// non-zero on any failure. Never spells the cohort length or total.

// First: the dashboard's view imports player helpers from a server-only module.
import "./stub-server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { COHORT_TOTAL, COHORT_TOTAL_CENTS, COHORT_WEEKS, formatDollars, listedPrograms, programGroups, programs } from "../content/programs";
import { NEWSLETTER_ANCHOR } from "../content/site";
import {
  BAND_HOURS,
  BANDS,
  availabilityChips,
  availabilityToCompactString,
  availabilityToLegacySlots,
  parseAvailability,
  serializeAvailability,
} from "../lib/availability";
import { intakeAvailabilitySlots, intakeAvailabilityValue } from "../lib/intakeRow";
import { PRIVATE_AREA_PREFIXES, isPrivateAreaPath } from "../lib/mainAction";
import { accountOpenCards, groupCards, openBlockCards } from "../lib/groupBlocks";
import { enrolledGroups, groupNotes, timesLine } from "../lib/dashboardCalm";
import {
  nextStepFor,
  type DashBooking,
  type DashEnrollment,
  type DashInvite,
  type NextStepInput,
} from "../lib/dashboardState";
import type { CohortSessionRow } from "../lib/cohortsDb";
import type { PlayerRecord } from "../lib/players";
import type { Cohort } from "../types/cohort";
import { FooterNewsletter } from "../components/layout/FooterNewsletter";
import { AvailabilityHoursLegend } from "../components/ui/AvailabilityGrid";
import { DashboardView, type DashboardViewProps } from "../app/dashboard/DashboardView";
import { DashboardErrorState, DashboardSkeleton } from "../app/dashboard/DashboardStates";

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
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** The words a piece of markup shows, in order. */
const words = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
/** The lime buttons in a piece of markup. */
const limeButtons = (html: string) => (html.match(/<(a|button) [^>]*>[\s\S]*?<\/\1>/g) ?? []).filter((a) => a.includes("bg-[#B4E655] "));
const at = (html: string, needle: string) => html.indexOf(needle);
/** Every .ts and .tsx file under a folder, as repo paths. */
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []
  );

// ─── 1. The newsletter line ──────────────────────────────────────────────────
console.log("1. No newsletter line on signed-in pages; public pages keep it");
{
  const footerLine = (pathname: string | null) =>
    renderToStaticMarkup(
      createElement(PathnameContext.Provider, { value: pathname }, createElement(FooterNewsletter, { id: NEWSLETTER_ANCHOR, className: "line" }))
    );
  const signedIn = ["/dashboard", "/dashboard/", "/profile", "/enroll/youth-programs-winter-2027-01-16", "/enroll/abc/confirmed", "/admin", "/admin/cohorts", "/admin/cohorts/abc", "/admin/players"];
  const open = ["/", "/programs", "/programs/youth-programs", "/about", "/assessment", "/assessment/book", "/intake", "/locations", "/login", "/legal/refund-policy", "/events"];
  check("the signed-in areas are the dashboard, the profile, enrolling and the admin", () => [...PRIVATE_AREA_PREFIXES].sort().join("|") === "/admin|/dashboard|/enroll|/profile");
  check("every signed-in path is read as one, with a trailing slash or a query", () => signedIn.every(isPrivateAreaPath) && isPrivateAreaPath("/dashboard?x=1") && isPrivateAreaPath("/profile#players"), () => signedIn.filter((p) => !isPrivateAreaPath(p)).join());
  check("no public path is, nor a look-alike, nor an unknown path", () => open.every((p) => !isPrivateAreaPath(p)) && !isPrivateAreaPath("/dashboards") && !isPrivateAreaPath("/administrator") && !isPrivateAreaPath("/programs/enroll") && !isPrivateAreaPath(null) && !isPrivateAreaPath(""), () => open.filter(isPrivateAreaPath).join());
  check("rendered on a signed-in page: no line, no email field, no empty band and no anchor", () => signedIn.every((p) => footerLine(p) === ""), () => signedIn.filter((p) => footerLine(p) !== "").join());
  check("rendered on a public page: the line, with its email field, inside the anchor Notify me points at", () =>
    open.every((p) => {
      const html = footerLine(p);
      return html.startsWith(`<div id="${NEWSLETTER_ANCHOR}" class="line">`) && count(html, 'type="email"') === 1;
    }),
    () => open.filter((p) => !footerLine(p).includes('type="email"')).join()
  );
  check("an unknown path (null) keeps the line: the rule hides it only where it knows the page is signed-in", () => footerLine(null).includes('type="email"'));
  const footer = read("src/components/layout/Footer.tsx");
  check("the footer hands the line its anchor and box, so a page without the line carries neither", () => /<FooterNewsletter\s+id=\{NEWSLETTER_ANCHOR\}\s+className="[^"]*border-b[^"]*"\s+\/>/.test(footer) && !/<div\s+id=\{NEWSLETTER_ANCHOR\}/.test(footer));
  check("the rule reads the path and nothing else: no sign-in, session or role", () => {
    const src = read("src/components/layout/FooterNewsletter.tsx");
    return src.includes("if (isPrivateAreaPath(pathname)) return null;") && !/signedIn|isAdmin|useAuthState|supabase|cookie/i.test(src);
  });
}

// ─── 2. The legend in 12-hour times ──────────────────────────────────────────
console.log("2. The availability grid's legend reads 12-hour times");
{
  const legend = words(renderToStaticMarkup(createElement(AvailabilityHoursLegend)));
  check("the three labels: 8am–12pm, 12–4pm, 4–8pm", () => BANDS.map((b) => BAND_HOURS[b].label).join(" | ") === "8am–12pm | 12–4pm | 4–8pm", () => BANDS.map((b) => BAND_HOURS[b].label).join(" | "));
  check("the legend, rendered: Morning 8am–12pm, Afternoon 12–4pm, Evening 4–8pm, then the fall line", () => legend === "Morning 8am–12pm Afternoon 12–4pm Evening 4–8pm Outdoor evenings end at dark in the fall.", () => legend);
  check("…and no 24-hour time is left in it", () => !/\d{1,2}:\d{2}/.test(legend));
  check("each label says the band's own hours", () =>
    BANDS.every((b) => {
      const h = (t: string) => Number(t.slice(0, 2)) % 12 || 12;
      const { start, end, label } = BAND_HOURS[b];
      return label.startsWith(String(h(start))) && label.endsWith(`${h(end)}pm`);
    })
  );
}

// ─── 3. Nothing stored changed ───────────────────────────────────────────────
console.log("3. Display only: what the quiz, the dashboard and enrolling store is what it was");
{
  const week = { days: { mon: ["eve"], wed: ["mor", "eve"], sat: ["aft"] }, v: 1 };
  check("the bands' keys and their 24-hour bounds are unchanged", () =>
    JSON.stringify(BANDS) === '["mor","aft","eve"]' &&
    JSON.stringify(BANDS.map((b) => [BAND_HOURS[b].start, BAND_HOURS[b].end])) === '[["08:00","12:00"],["12:00","16:00"],["16:00","20:00"]]'
  );
  check("the grid's stored shape: day keys and band keys, version 1, never a label", () =>
    JSON.stringify(serializeAvailability({ mon: ["eve"], wed: ["mor", "eve"], sat: ["aft"] })) === '{"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}' &&
    JSON.stringify(parseAvailability(week)) === '{"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}',
    () => JSON.stringify(serializeAvailability({ mon: ["eve"], wed: ["mor", "eve"], sat: ["aft"] }))
  );
  check("the Sheet's availability cell (column 16), as /api/intake writes it", () =>
    availabilityToCompactString(week) === "v1:mon:eve;wed:mor,eve;sat:aft" && intakeAvailabilityValue({ availability: week } as never) === "v1:mon:eve;wed:mor,eve;sat:aft",
    () => intakeAvailabilityValue({ availability: week } as never)
  );
  check("the legacy slots the quiz sends, and a legacy list passed through as it came", () =>
    availabilityToLegacySlots(week).sort().join() === "weekday-daytime,weekday-evening,weekend-afternoon" &&
    intakeAvailabilitySlots({ availability: week } as never).sort().join() === "weekday-daytime,weekday-evening,weekend-afternoon" &&
    intakeAvailabilityValue({ availability: ["weekday-evening", "weekend-morning"] } as never) === "weekday-evening, weekend-morning"
  );
  check("the admin's chips and the booking email's times keep the band keys", () => availabilityChips(week).join(" | ") === "Mon eve | Wed mor/eve | Sat aft");
  // No writer reads the legend's label: only the two components that draw it.
  const readers = walk("src")
    .filter((f) => !f.startsWith("src/scripts/") && f !== "src/lib/availability.ts")
    .filter((f) => /BAND_HOURS\[[^\]]+\]\.label/.test(read(f)))
    .sort();
  check("only the two components that draw the legend read its label", () => readers.join() === "src/components/admin/AvailabilityMatrix.tsx,src/components/ui/AvailabilityGrid.tsx", () => readers.join());
  const writers = ["src/lib/intakeRow.ts", "src/app/api/intake/route.ts", "src/app/api/enroll/route.ts", "src/app/api/profile/availability/route.ts", "src/lib/players.ts", "src/lib/tiers.ts", "src/lib/intakeAccount.ts"];
  check("no quiz, enroll or profile writer names the hours' labels at all", () => writers.every((f) => !/BAND_HOURS|8am–12pm|12–4pm|4–8pm/.test(read(f))), () => writers.filter((f) => /BAND_HOURS/.test(read(f))).join());
  check("the times line on the dashboard is words from the band keys, and stores nothing", () =>
    timesLine(week) === "Mon evening · Wed morning and evening · Sat afternoon" && timesLine({ days: { sun: ["mor", "aft", "eve"] }, v: 1 }) === "Sun all day" && timesLine(null) === ""
  );
}

// ─── Fixtures (fictional) ────────────────────────────────────────────────────

const TODAY = "2026-11-26";
const NOW = "2026-11-26T15:00:00.000Z";
const PRICE = COHORT_TOTAL_CENTS;

const block = (over: Partial<Cohort> & Pick<Cohort, "id">): Cohort => ({
  programId: "bootcamps",
  locationId: "",
  label: over.id,
  startDate: "2027-01-17",
  endDate: "",
  weeks: COHORT_WEEKS,
  sessions: [{ day: "Sun", start: "17:00", end: "18:00" }],
  capacityMin: 3,
  capacityMax: 8,
  priceCents: PRICE,
  currency: "CAD",
  status: "open",
  levelMin: 3,
  levelMax: 3.5,
  visibility: "public",
  dbStatus: "inviting",
  paymentMode: "etransfer",
  ...over,
});
/** The Intermediate youth block the Reyes children are in; the coach's label is "Winter Saturday". */
const YOUTH = block({ id: "coh_youth", programId: "youth-programs", label: "Winter Saturday", startDate: "2027-01-16", sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] });
const ADULT_INT = block({ id: "coh_adult_int", label: "Winter Sunday" });
const ADULT_NOVICE = block({ id: "coh_adult_nov", label: "Winter Wednesday", startDate: "2027-01-13", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Wed", start: "19:00", end: "20:00" }] });
const RUNNING = block({ id: "coh_running", label: "Fall Thursday", startDate: "2026-11-12", dbStatus: "running", sessions: [{ day: "Thu", start: "19:00", end: "20:00" }] });
const COHORTS = [RUNNING, ADULT_NOVICE, YOUTH, ADULT_INT];

const record = (over: Partial<PlayerRecord> & Pick<PlayerRecord, "id" | "full_name" | "relationship">): PlayerRecord => ({
  account_id: "acct",
  is_minor: false,
  level: null,
  level_assessed_at: null,
  level_notes: null,
  availability: parseAvailability(null),
  availability_updated_at: null,
  availability_source: null,
  availability_note: null,
  age_band: null,
  self_level: null,
  ...over,
});
const REYES_WEEK = parseAvailability({ days: { wed: ["eve"], sat: ["mor", "aft"], sun: ["aft"] }, v: 1 });
const dana = record({ id: "p_dana", full_name: "Dana Reyes", relationship: "self" });
const maya = record({ id: "p_maya", full_name: "Maya Reyes", relationship: "child", is_minor: true, age_band: "junior", self_level: "competitive", availability: REYES_WEEK, availability_source: "intake" });
const leo = record({ id: "p_leo", full_name: "Leo Reyes", relationship: "child", is_minor: true, age_band: "teen", level: 3, level_assessed_at: "2026-11-14T16:05:00+00:00", availability: REYES_WEEK, availability_source: "intake" });
const sam = record({ id: "p_sam", full_name: "Sam Patel", relationship: "self" });
const samQuiz = record({ ...sam, self_level: "rally", age_band: "adult", availability: parseAvailability({ days: { mon: ["eve"], wed: ["eve"], sat: ["mor", "aft"] }, v: 1 }), availability_source: "intake" });
const anya = record({ id: "p_anya", full_name: "Anya Patel", relationship: "child", is_minor: true, age_band: "junior", self_level: "unsure", availability: parseAvailability({ days: { sat: ["mor", "aft"], sun: ["mor"] }, v: 1 }) });

const enrollment = (over: Partial<DashEnrollment> & Pick<DashEnrollment, "id">): DashEnrollment => ({ cohort_id: "coh_youth", program: "youth-programs", participant_name: "Maya Reyes", status: "paid", created_at: "", ...over });
const invite = (over: Partial<DashInvite> = {}): DashInvite => ({
  id: "inv_leo",
  cohort_id: "coh_youth",
  token: "tok_leo",
  status: "invited",
  expires_at: "2026-11-27T23:00:00.000Z",
  payment_method: null,
  participant_id: "p_leo",
  amountDueCents: PRICE,
  creditBookingId: null,
  ...over,
});
const leoDec5: DashBooking = { id: "bk_leo", participantId: "p_leo", playerName: "Leo Reyes", date: "2026-12-05", start: "10:20", locationLabel: "Newtonbrook Tennis Club" };
const classRow = (id: string, date: string, over: Partial<CohortSessionRow> = {}): CohortSessionRow => ({
  id,
  cohort_id: "coh_running",
  session_date: date,
  start_time: "19:00:00",
  end_time: "20:00:00",
  status: "scheduled",
  cancellation_reason: null,
  makeup_for: null,
  ...over,
});

const noop = () => {};
const ROUTER = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, hmrRefresh: noop };
const progs = programs.map((p) => ({ id: p.id, title: p.title }));

type Account = {
  self: PlayerRecord;
  players: PlayerRecord[];
  roster: PlayerRecord[];
  voice: "you" | "named";
  enrollments?: DashEnrollment[];
  invites?: DashInvite[];
  bookings?: DashBooking[];
  sessionsByCohort?: Record<string, CohortSessionRow[]>;
  cohorts?: Cohort[];
  /** The public blocks, for "Groups with dates". */
  openBlocks?: Cohort[];
  seats?: Record<string, number>;
  nothingOnFile?: boolean;
  view?: Partial<DashboardViewProps>;
};

/** The page's props for an account, built the way the page builds them, then rendered. */
function page(a: Account) {
  const cohorts = a.cohorts ?? COHORTS;
  const enrollments = a.enrollments ?? [];
  const invites = a.invites ?? [];
  const bookings = a.bookings ?? [];
  const sessionsByCohort = a.sessionsByCohort ?? {};
  const allOpen = openBlockCards(groupCards(programGroups, a.openBlocks ?? [], a.seats));
  const openGroups = accountOpenCards(allOpen, {
    enrolledCohortIds: enrollments.map((e) => e.cohort_id),
    heldCohortIds: invites.map((i) => i.cohort_id),
    players: a.roster,
  });
  const input: NextStepInput = {
    selfId: a.self.id,
    roster: a.roster,
    voice: a.voice,
    enrollments,
    cohorts,
    sessionsByCohort,
    programs: progs,
    invites,
    bookings,
    recipientEmail: "info@tennisbootcamp.ca",
    today: TODAY,
    now: NOW,
    groupsBelow: openGroups.length > 0,
    nothingOnFile: a.nothingOnFile,
  };
  const step = nextStepFor(input);
  const props: DashboardViewProps = {
    heading: `Welcome back, ${a.self.full_name?.split(" ")[0]}`,
    self: a.self,
    players: a.players,
    roster: a.roster,
    voice: a.voice,
    nextStep: step,
    creditLine: null,
    creditWaiting: false,
    enrollments,
    cohorts,
    sessionsByCohort,
    bookings,
    invites,
    now: NOW,
    openForTier: [],
    openGroups,
    anyGroupOpen: allOpen.length > 0,
    suggestions: [],
    programs,
    placedSpans: {},
    today: TODAY,
    quizTaken: true,
    ...a.view,
  };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: ROUTER as never }, createElement(DashboardView, props)));
  return { html, step, text: words(html) };
}
const part = (html: string, id: string) => {
  const from = html.indexOf(`<section aria-labelledby="${id}-heading" id="${id}"`);
  return from < 0 ? "" : html.slice(from, html.indexOf("</section>", from));
};
const stepCard = (html: string) => html.slice(html.indexOf('<section aria-labelledby="next-step"'), html.indexOf("</section>"));

// The main states, and the ones that follow the same layout.
const leoTransfer = invite({ payment_method: "etransfer", payment_note: "Leo Reyes", amountDueCents: PRICE - 2000, creditBookingId: "b_leo_nov" });
const family = { self: dana, players: [dana, maya, leo], roster: [maya, leo], voice: "named" as const };
const familyEtransfer = page({
  ...family,
  enrollments: [enrollment({ id: "e_maya" }), enrollment({ id: "e_leo", participant_name: "Leo Reyes", status: "pending" })],
  invites: [leoTransfer],
  bookings: [leoDec5],
  openBlocks: [YOUTH],
  view: { placedSpans: { p_maya: { min: 3, max: 3.5 } }, suggestions: [{ program: listedPrograms.find((p) => p.id === "private-lessons")!, fit: { name: "Leo" } as never }] },
});
const newAccount = page({ self: sam, players: [sam], roster: [sam], voice: "you", nothingOnFile: true, view: { heading: "Welcome, Sam", quizTaken: false, suggestions: listedPrograms.slice(0, 2).map((program) => ({ program, fit: null })) } });
const familyTwo = page({
  self: samQuiz,
  players: [samQuiz, anya],
  roster: [samQuiz, anya],
  voice: "named",
  openBlocks: [YOUTH, ADULT_NOVICE, ADULT_INT],
  seats: { coh_adult_int: 3 },
  view: { heading: "Welcome, Sam", suggestions: [{ program: listedPrograms.find((p) => p.id === "private-lessons")!, fit: null }] },
});
const heldSpot = page({ self: samQuiz, players: [samQuiz], roster: [samQuiz], voice: "you", invites: [invite({ id: "inv_sam", cohort_id: "coh_adult_nov", participant_id: "p_sam" })], openBlocks: [ADULT_NOVICE, ADULT_INT] });
const makeUpRows = [
  classRow("s1", "2026-11-12", { status: "completed" }),
  classRow("s2", "2026-11-19", { status: "completed" }),
  classRow("s3", "2026-11-26"),
  classRow("s4", "2026-12-03", { status: "cancelled", cancellation_reason: "court" }),
  classRow("s5", "2026-12-10"),
  classRow("s6", "2026-12-17"),
  classRow("s7", "2026-12-24", { makeup_for: "s4" }),
];
const midWay = page({
  self: { ...samQuiz, level: 3 },
  players: [{ ...samQuiz, level: 3 }],
  roster: [{ ...samQuiz, level: 3 }],
  voice: "you",
  enrollments: [enrollment({ id: "e_sam", cohort_id: "coh_running", program: "bootcamps", participant_name: "Sam Patel" })],
  sessionsByCohort: { coh_running: makeUpRows },
});
const testEnrollment = page({
  self: samQuiz,
  players: [samQuiz],
  roster: [samQuiz],
  voice: "you",
  enrollments: [enrollment({ id: "e_test", cohort_id: "coh_adult_nov", program: "bootcamps", participant_name: "Sam Patel", status: "test_paid" })],
  view: { placedSpans: { p_sam: { min: 2, max: 2.5 } } },
});
const PRIVATE = block({ id: "coh_private", label: "Winter Tuesday", startDate: "2027-01-12", visibility: "private", sessions: [{ day: "Tue", start: "19:00", end: "20:00" }] });
const openForTier = page({
  self: { ...samQuiz, level: 3 },
  players: [{ ...samQuiz, level: 3 }],
  roster: [{ ...samQuiz, level: 3 }],
  voice: "you",
  view: { openForTier: [{ cohort: PRIVATE, players: [{ ...samQuiz, level: 3 }] }] },
});
const STATES: Record<string, { html: string; text: string }> = { familyEtransfer, newAccount, familyTwo, heldSpot, midWay, testEnrollment, openForTier };

// ─── 4. The page, in every state ─────────────────────────────────────────────
console.log("4. The page: one next step, what is coming up, the groups, groups with dates, the players");
{
  const { html, step, text } = familyEtransfer;
  check("the welcome is a plain heading with Edit profile beside it: the page's one h1, in no card", () => {
    const header = html.slice(at(html, "<header"), at(html, "</header>"));
    return count(html, "<h1") === 1 && header.includes('<h1 id="dashboard-welcome"') && words(header) === "Welcome back, Dana Edit profile" && /<a [^>]*href="\/profile"/.test(header) && !header.includes("rounded-2xl");
  });
  check("top to bottom: the next step, Coming up, Your group, Groups with dates, Your players, Suggested for you", () => {
    const order = ['aria-labelledby="next-step"', 'id="coming-up"', 'id="my-programs"', 'id="open-groups"', 'id="availability"', 'id="suggested"'].map((n) => at(html, n));
    return order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1]));
  });
  check("a waiting e-transfer reads as three labelled facts: Amount, Send to, Message", () => {
    const card = stepCard(html);
    const facts = [...card.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => `${m[1]}=${m[2]}`);
    return step.kind === "etransfer" && facts.join(" | ") === `Amount=${formatDollars(COHORT_TOTAL - 20)} | Send to=info@tennisbootcamp.ca | Message=Leo Reyes – Winter Saturday`;
  }, () => words(stepCard(html)));
  check("…the message keeps the coach's block label, which payments are matched by; it shows nowhere else on the page", () => count(text, "Winter Saturday") === 1 && words(stepCard(html)).includes("Message Leo Reyes – Winter Saturday"));
  check("…with nothing to do while it waits, the card has no button, and the $20 is said once", () => limeButtons(html).length === 0 && !stepCard(html).includes("<a ") && count(text, "$20") === 1);
  check("Coming up lists the assessment and the paid player's first class, soonest first", () =>
    words(part(html, "coming-up")) === "Coming up Sat Dec 5 Leo's assessment · 10:20am 20 minutes on court · Newtonbrook Tennis Club Sat Jan 16 First class · 1–2pm Intermediate Youth Bootcamp · Maya",
    () => words(part(html, "coming-up"))
  );
  check("one card for the group both children are in, by its name on /programs, each with their own status", () => {
    const mine = part(html, "my-programs");
    return (
      count(mine, "<article") === 1 &&
      words(mine) === "Your group Intermediate , tier 3 of 5, levels 3.0–3.5 Intermediate Youth Bootcamp Jan 16 – Feb 20 Saturdays 1–2pm Newtonbrook Tennis Club Maya Reyes Enrolled Leo Reyes E-transfer pending"
    );
  }, () => words(part(html, "my-programs")));
  check("…two groups read Your groups, in the order they start", () => {
    const two = page({ ...family, enrollments: [enrollment({ id: "e1" }), enrollment({ id: "e2", cohort_id: "coh_adult_nov", program: "bootcamps", participant_name: "Leo Reyes" })] });
    const mine = part(two.html, "my-programs");
    return count(mine, "<article") === 2 && words(mine).startsWith("Your groups Novice , tier 2 of 5, levels 2.0–2.5 Novice Adult Bootcamp") && at(mine, "Novice Adult Bootcamp") < at(mine, "Intermediate Youth Bootcamp");
  });
  check("the group the account is in is not offered again: the line that is true, and the link, with no dashed box", () => {
    const open = part(html, "open-groups");
    return words(open) === "Groups with dates No group with dates is open to your players right now. Browse Programs" && !open.includes("border-dashed") && /<a [^>]*href="\/programs"[^>]*>Browse Programs<\/a>/.test(open);
  }, () => words(part(html, "open-groups")));
  check("one players section: each player's emblem, level line and week as one line, with Edit times", () => {
    const players = words(part(html, "availability"));
    return (
      players.startsWith("Your players Our coaches build every group around the times its players can train. Keep this current.") &&
      players.includes("Maya Reyes My child · Junior (7–13) Intermediate group, provisional until our coaches confirm it on court in week one. Wed evening · Sat morning and afternoon · Sun afternoon Edit times for Maya") &&
      players.includes("Leo Reyes My child · Teen (14–17) Intermediate · 3.0") &&
      players.includes("Set by our coaches") &&
      players.endsWith("Add another player Retake the quiz") &&
      count(part(html, "availability"), "<svg") >= 2
    );
  }, () => words(part(html, "availability")));
  check("…the grid is closed until Edit times opens it: no grid cell is drawn on load", () => !html.includes("Confirm for the season") && count(html, 'aria-expanded="false"') === 2 && read("src/app/dashboard/PlayerTimes.tsx").includes("<AvailabilityEditor"));
  check("the holder who does not train is not a player on the page", () => !words(part(html, "availability")).includes("Dana"));
  check("suggestions show, one row each, when no group with dates is listed", () => words(part(html, "suggested")).startsWith("Suggested for you Private Lessons") && words(part(html, "suggested")).endsWith("Fits Leo See details : Private Lessons"), () => words(part(html, "suggested")));
}
{
  const { html, text } = newAccount;
  check("a new account: pick a group; the one lime button is Join a bootcamp, the assessment the outline, the quiz the side line", () => {
    const lime = limeButtons(html);
    const card = words(stepCard(html));
    return lime.length === 1 && words(lime[0]) === "Join a bootcamp" && card.endsWith("Join a bootcamp Book Your Assessment Not sure which group? Take the 2-minute quiz");
  }, () => words(stepCard(html)));
  check("…no Coming up and no group section; No group has dates yet.; Your level and times; Add times", () =>
    !html.includes('id="coming-up"') &&
    !html.includes('id="my-programs"') &&
    words(part(html, "open-groups")) === "Groups with dates No group has dates yet. Browse Programs" &&
    words(part(html, "availability")).includes("Your level and times") &&
    words(part(html, "availability")).includes("Sam Patel Myself No level yet. Our coaches confirm it on court in week one. No times on file yet. Add times") &&
    !text.includes("Retake the quiz")
  , () => words(part(html, "availability")));
}
{
  const { html } = familyTwo;
  check("groups with dates are the /programs cards, each Enroll an outline to its sign-up page", () => {
    const open = part(html, "open-groups");
    const enroll = open.match(/<a [^>]*href="\/enroll\/[^"]*"[^>]*>/g) ?? [];
    return count(open, "<article") === 3 && enroll.length === 3 && enroll.every((a) => !a.includes("bg-[#B4E655] ")) && words(open).includes("3 spots left") && words(open).includes(`${formatDollars(COHORT_TOTAL)} for`);
  }, () => words(part(html, "open-groups")));
  check("…with groups listed, no suggestions; the lime button is the next step's", () => !html.includes('id="suggested"') && limeButtons(html).length === 1 && words(limeButtons(html)[0]) === "Update availability" && stepCard(html).includes(limeButtons(html)[0]));
}
{
  const { html, step, text } = heldSpot;
  check("a held spot: the deadline is the heading, Claim my spot the one lime button, and its block is not offered again below", () =>
    step.kind === "invite" && words(stepCard(html)).startsWith("Your spot is held until Fri, Nov 27, 6:00pm.") && limeButtons(html).length === 1 && words(limeButtons(html)[0]) === "Claim my spot" && !part(html, "open-groups").includes("/enroll/coh_adult_nov") && part(html, "open-groups").includes("/enroll/coh_adult_int"),
    () => text.slice(0, 400)
  );
  const second = page({ ...family, enrollments: [enrollment({ id: "e_maya" })], invites: [invite({ id: "a", expires_at: "2026-11-27T23:00:00.000Z" }), invite({ id: "b", cohort_id: "coh_adult_nov", participant_id: "p_maya", token: "t2", expires_at: "2026-11-28T17:00:00.000Z" })], bookings: [leoDec5] });
  check("a second held spot's deadline is a row in Coming up, with every other dated item", () =>
    words(part(second.html, "coming-up")) === "Coming up Sat Nov 28 Maya's held spot · until 12pm Novice Adult Bootcamp Sat Dec 5 Leo's assessment · 10:20am 20 minutes on court · Newtonbrook Tennis Club Sat Jan 16 First class · 1–2pm Intermediate Youth Bootcamp · Maya",
    () => words(part(second.html, "coming-up"))
  );
}
{
  const { html, step } = midWay;
  check("mid-way through a block: the next class is the heading, in the group's name, with no button", () =>
    step.kind === "session" && words(stepCard(html)) === "Your next class is Thu Nov 26 at 7pm. Intermediate Adult Bootcamp · 7–8pm" && limeButtons(html).length === 0,
    () => words(stepCard(html))
  );
  check("…its class dates sit behind one line: the ones to come, the make-up with the date it replaces, then the past ones; the cancelled class is not listed", () => {
    const mine = part(html, "my-programs");
    const list = words(mine.slice(at(mine, "<details")));
    return (
      count(mine, "<details") === 1 &&
      !mine.includes("<details open") &&
      list === "Class dates (4) Thu Nov 26 7–8pm Thu Dec 10 7–8pm Thu Dec 17 7–8pm Thu Dec 24 7–8pm Make-up, replaces Dec 3 Past Thu Nov 19 7–8pm Thu Nov 12 7–8pm"
    );
  }, () => words(part(html, "my-programs")));
  const leadsElse = page({ self: { ...samQuiz, level: 3 }, players: [{ ...samQuiz, level: 3 }], roster: [{ ...samQuiz, level: 3 }], voice: "you", enrollments: [enrollment({ id: "e_sam", cohort_id: "coh_running", program: "bootcamps", participant_name: "Sam Patel" })], sessionsByCohort: { coh_running: makeUpRows.filter((r) => r.session_date > "2026-12-17" || r.status !== "scheduled") }, bookings: [{ ...leoDec5, id: "bk_sam", participantId: "p_sam", playerName: "Sam Patel" }] });
  check("…and a make-up that is the next class reads Make-up class in Coming up", () => words(part(leadsElse.html, "coming-up")).includes("Thu Dec 24 Make-up class · 7–8pm Intermediate Adult Bootcamp"), () => words(part(leadsElse.html, "coming-up")));
}
{
  const { html } = testEnrollment;
  check("a test enrollment says so on its chip and in one line: no money was taken", () => {
    const mine = words(part(html, "my-programs"));
    return mine.endsWith("Sam Patel Test enrollment A test enrollment: no money was taken.") && mine.startsWith("Your group Novice , tier 2 of 5, levels 2.0–2.5 Novice Adult Bootcamp Jan 13 – Feb 17 Wednesdays 7–8pm");
  }, () => words(part(html, "my-programs")));
  const cancelled = page({ ...family, cohorts: [{ ...YOUTH, dbStatus: "cancelled" }], enrollments: [enrollment({ id: "e1" }), enrollment({ id: "e2", participant_name: "Leo Reyes" })] });
  check("a state's line is said once however many players share it", () => count(words(part(cancelled.html, "my-programs")), "This cohort was cancelled. Our coaches will contact you directly.") === 1 && count(part(cancelled.html, "my-programs"), ">Cancelled<") === 2);
  const groups = enrolledGroups([enrollment({ id: "e1", status: "pending" }), enrollment({ id: "e2", participant_name: "Leo Reyes" })], [YOUTH], progs);
  check("…and the e-transfer step's own line is not repeated on the card under it", () => groupNotes(groups[0], ["etransfer-pending"]).length === 0 && groupNotes(groups[0]).join() === "The spot is held while our coaches confirm the e-transfer arrived.");
}
{
  const { html } = openForTier;
  check("Open for your tier keeps its place under Groups with dates, in the same layout, its Enroll an outline", () => {
    const tier = part(html, "open-for-tier");
    return (
      at(html, 'id="open-groups"') < at(html, 'id="open-for-tier"') &&
      at(html, 'id="open-for-tier"') < at(html, 'id="availability"') &&
      words(tier).startsWith("Open for your tier Cohorts whose level band fits, with room left. Adult Bootcamps Starts Jan 12") &&
      /<a [^>]*href="\/enroll\/coh_private"[^>]*>Enroll<\/a>/.test(tier) &&
      !(tier.match(/<a [^>]*href="\/enroll\/coh_private"[^>]*>/) ?? [""])[0].includes("bg-[#B4E655] ")
    );
  }, () => words(part(html, "open-for-tier")));
}
{
  const error = renderToStaticMarkup(createElement(DashboardErrorState));
  check("the load error says what is wrong and both ways out: refresh, or info@tennisbootcamp.ca", () =>
    words(error) === "Couldn't load your dashboard right now. Refresh the page. If it keeps happening, email info@tennisbootcamp.ca . Refresh" &&
    error.includes('href="mailto:info@tennisbootcamp.ca"') &&
    /<a [^>]*href="\/dashboard"[^>]*>Refresh<\/a>/.test(error) &&
    limeButtons(error).length === 0,
    () => words(error)
  );
  const ghost = renderToStaticMarkup(createElement(DashboardSkeleton));
  check("the loading state is the page's own shape and says nothing", () => words(ghost) === "" && ghost.includes("animate-pulse") && count(ghost, "rounded-2xl") === 1);
}

console.log("Every state: one lime at most, no capital label, no arrow, no card in a card");
for (const [name, state] of Object.entries(STATES)) {
  const { html, text } = state;
  check(`${name}: at most one lime button, and it is the next step's`, () => {
    const lime = limeButtons(html);
    return lime.length <= 1 && lime.every((b) => stepCard(html).includes(b));
  }, () => limeButtons(html).map(words).join(" | "));
  check(`${name}: no capital label, no arrow typed after a link's words, no shadow`, () => !/\buppercase\b/.test(html) && !/[→←»›]/.test(text) && !/shadow-/.test(html));
  check(`${name}: no card inside a card`, () => {
    // Walk the markup: a card (the site's Card class) never opens inside another.
    const CARD = "rounded-2xl border border-white/10 bg-white/[0.03]";
    const stack: boolean[] = [];
    let nested = false;
    for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*?)(\/?)>/g)) {
      const [, closing, tag, attrs, selfClosing] = m;
      if (["input", "br", "img", "path", "circle", "rect", "line", "polyline", "polygon", "hr"].includes(tag) || selfClosing) continue;
      if (closing) stack.pop();
      else {
        const isCard = attrs.includes(CARD);
        if (isCard && stack.some(Boolean)) nested = true;
        stack.push(isCard);
      }
    }
    return !nested;
  });
  check(`${name}: every heading is on the one scale`, () => (html.match(/<h[1-6][^>]*>/g) ?? []).every((h) => /text-(3xl|2xl|lg) font-semibold/.test(h)), () => (html.match(/<h[1-6][^>]*>/g) ?? []).filter((h) => !/text-(3xl|2xl|lg) font-semibold/.test(h)).join(" "));
}
check("the coach's block label never names a group on the page: only an e-transfer's message carries it", () =>
  Object.values(STATES).every((s) => ["Winter Sunday", "Winter Wednesday", "Fall Thursday", "Winter Tuesday"].every((label) => !s.text.includes(label)))
);
check("what left the page is gone from every state", () =>
  Object.values(STATES).every((s) => !/Where we train|Training someone else too|Your players' tiers|Unranked|See my programs|See all sessions|Weekly schedule|Payment pending$/i.test(s.text))
);

// ─── 5. Notify me still lands on a newsletter line ───────────────────────────
console.log("5. A full block's Notify me opens the line on /programs");
{
  const full = page({ self: samQuiz, players: [samQuiz], roster: [samQuiz], voice: "you", openBlocks: [ADULT_INT], seats: { coh_adult_int: 0 } });
  const open = part(full.html, "open-groups");
  check("the dashboard carries no newsletter line, so a full block's Notify me goes to the one on /programs", () =>
    words(open).includes("Full") && new RegExp(`<a href="/programs#${NEWSLETTER_ANCHOR}"[^>]*>Notify me`).test(open) && !open.includes(`href="#${NEWSLETTER_ANCHOR}"`),
    () => open.slice(-700)
  );
  check("…and /programs is a public page, where the line is drawn", () => !isPrivateAreaPath("/programs"));
  const others = ["src/app/enroll", "src/app/profile", "src/app/admin"];
  check("no other signed-in page links to the footer's line", () => others.flatMap(walk).every((f) => !/NEWSLETTER_ANCHOR|#notify|ProgramGroupCard|OpenGroupsList/.test(read(f))), () => others.flatMap(walk).filter((f) => /NEWSLETTER_ANCHOR|#notify|ProgramGroupCard|OpenGroupsList/.test(read(f))).join());
}

// ─── The wiring ──────────────────────────────────────────────────────────────
console.log("The page hands the view its facts");
{
  const src = read("src/app/dashboard/page.tsx");
  check("Coming up gets the bookings, the invites and the clock the next step read", () => src.includes("      bookings={bookings}\n      invites={invites}\n      now={now}\n"));
  check("the page draws the loading and error states from the one file", () => src.includes("<Suspense fallback={<DashboardSkeleton />}>") && src.includes("return <DashboardErrorState />;"));
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("npm test runs this file", () => pkg.scripts.test.includes("npx tsx src/scripts/test-dashboard-one-look.ts"));
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll one-look dashboard checks passed.");

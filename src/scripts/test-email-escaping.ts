// Run from project root: npx tsx src/scripts/test-email-escaping.ts
//
// Pins backlog #43 (audit follow-up; owner, 2026-11-20): what a person types
// into the site's forms shows in an email as text, never as a tag.
//
//   1. The helper: escapeHtml turns &, <, >, " and ' into entities and leaves
//      every other character as typed.
//   2. Every email builder in src/lib/emailBodies.ts, rendered with
//      <a href="https://x.test">x</a>, <img src=x> and "><b> in every typed
//      field, for the account holder and for another player on the account:
//      the HTML has the same tags as the same email rendered with plain
//      words, no link, image or bold from the input is live, and the input
//      shows as text. The plain text keeps it as typed. The subject is not
//      escaped, and a line break typed into a name or a label leaves it one
//      line.
//   3. Names read as typed: O'Neil, Zoë, Ana-María and Lê Văn, in what the
//      inbox shows, in the plain text and in the subject.
//   4. The links the app makes still work, the card link included.
//   5. Every builder the file exports is rendered here (the source is read
//      with either line ending), and this script is in the npm test chain.
//
// Pure: no network, no Resend, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml } from "../lib/escapeHtml";
import type { Recommendation } from "../lib/recommend";
import {
  type CohortInviteParams,
  type EmailBody,
  buildLinkEmail,
  buildRecommendationEmail,
  buildBookingConfirmationEmail,
  buildAssessmentRequestReceivedEmail,
  buildAssessmentRequestAdminEmail,
  buildCohortInviteEmail,
  buildCohortConfirmedEmail,
  buildSessionCancelledEmail,
  buildAssessmentCompleteEmail,
  buildEtransferInstructionsEmail,
  buildPaymentReceivedEmail,
  buildEnrolledEmail,
  buildAccountSetupEmail,
  buildEtransferPendingAdminEmail,
  buildPaymentUnmatchedAdminEmail,
} from "../lib/emailBodies";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown = true) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}
      expected ${e}
      got      ${a}`);
  }
}

const ROOT = process.cwd();
/** A source file with LF line endings, so a CRLF checkout reads the same. */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

// ─── Reading an email the way an inbox does ───────────────────────────────────

/** Every tag, its quoted attribute values blanked: the email's structure. */
function tagShapes(html: string): string[] {
  return (html.match(/<[^>]*>/g) ?? []).map((tag) => tag.replace(/="[^"]*"/g, '=""'));
}

/** A tag the input would add if it were live: a bold, a link to x.test, an image of x. */
function liveInputTags(html: string): string[] {
  return (html.match(/<[^>]*>/g) ?? []).filter(
    (tag) =>
      /^<b[\s>/]/i.test(tag) ||
      /^<a\s[^>]*\bhref=["']?https:\/\/x\.test/i.test(tag) ||
      /^<img\s[^>]*\bsrc=["']?x["'\s>/]/i.test(tag)
  );
}

/** The five entities read back, as a mail client reads them. */
function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The text a reader sees: tags dropped, spaces collapsed, entities read back. */
const visibleText = (html: string) => decode(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));

const ENTITY = /&(?:amp|lt|gt|quot|#39);/;
const LINE_BREAK = /[\r\n\v\f\u0085\u{2028}\u{2029}]/u;
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SITE = "https://tennisbootcamp.ca";
/** The set-password link as enrollmentActions builds it: a token, then &type and &next. */
const SETUP_LINK = `${SITE}/auth/callback?token_hash=abc123&type=invite&next=/set-password`;
const ENROLL_URL = `${SITE}/enroll/c1?invite=tok123`;

const recommendation = {
  program: { title: "Adult Bootcamps" },
  score: 1,
  reason: "",
} as unknown as Recommendation;

const INVITE: CohortInviteParams = {
  participantName: "Alex Chen",
  levelLabel: "3.0",
  tierNames: ["Intermediate"],
  programTitle: "Adult Bootcamps",
  cohortLabel: "Fall A",
  dayTimeLabel: "Saturdays 9–10am",
  startDateLabel: "Oct 17",
  weeks: 4,
  priceCents: 20000,
  creditCents: 2000,
  holdHours: 48,
  enrollUrl: ENROLL_URL,
};

/**
 * One rendering of a builder. `v` fills the account holder and every other
 * typed field; `w` fills the player's name. With v === w the email is about
 * the holder; with two values it is about another player on the account.
 */
type Case = { label: string; builder: string; render: (v: string, w: string) => EmailBody };

const CASES: Case[] = [
  {
    label: "quiz result, with a tier",
    builder: "buildRecommendationEmail",
    render: (v, w) => buildRecommendationEmail(v, [recommendation], "Novice", w),
  },
  {
    label: "quiz result, no tier",
    builder: "buildRecommendationEmail",
    render: (v, w) => buildRecommendationEmail(v, [recommendation], null, w),
  },
  {
    label: "assessment booked, the slot's location typed in admin",
    builder: "buildBookingConfirmationEmail",
    render: (v, w) =>
      buildBookingConfirmationEmail({ name: v, participantName: w, dateLabel: "Sat Oct 10", timeLabel: "9:00am", locationLabel: v }),
  },
  {
    label: "assessment booked, no location",
    builder: "buildBookingConfirmationEmail",
    render: (v, w) => buildBookingConfirmationEmail({ name: v, participantName: w, dateLabel: "Sat Oct 10", timeLabel: "9:00am" }),
  },
  {
    label: "assessment request received",
    builder: "buildAssessmentRequestReceivedEmail",
    render: (v, w) => buildAssessmentRequestReceivedEmail({ name: v, participantName: w }),
  },
  {
    label: "assessment request, to the coach's inbox",
    builder: "buildAssessmentRequestAdminEmail",
    render: (v, w) =>
      buildAssessmentRequestAdminEmail({ name: v, participantName: w, email: v, phone: v, selfLevel: v, preferredTimes: [v, v], note: v }),
  },
  {
    label: "cohort invitation, a tiered group",
    builder: "buildCohortInviteEmail",
    render: (v, w) => buildCohortInviteEmail({ ...INVITE, participantName: w, programTitle: v, cohortLabel: v, locationLine: v }),
  },
  {
    label: "cohort invitation, an untiered group named by its program",
    builder: "buildCohortInviteEmail",
    render: (v, w) =>
      buildCohortInviteEmail({ ...INVITE, levelLabel: null, tierNames: [], participantName: w, programTitle: v, cohortLabel: v, locationLine: v }),
  },
  {
    label: "cohort confirmed",
    builder: "buildCohortConfirmedEmail",
    render: (v, w) =>
      buildCohortConfirmedEmail({ participantName: w, cohortLabel: v, programTitle: v, startDateLabel: "Oct 17", sessionLines: ["Sat Oct 17 · 9–10am"] }),
  },
  {
    label: "session cancelled",
    builder: "buildSessionCancelledEmail",
    render: (v) =>
      buildSessionCancelledEmail({
        cohortLabel: v,
        dateLabel: "Saturday, October 24",
        reasonLine: "Weather made the courts unplayable.",
        makeup: { dateLabel: "Saturday, November 28", newEndDateLabel: "November 28" },
        makeupMaxWeeks: 2,
      }),
  },
  {
    label: "assessment complete, a level on the ladder",
    builder: "buildAssessmentCompleteEmail",
    render: (v, w) => buildAssessmentCompleteEmail({ name: v, participantName: w, levelLabel: "3.0", coachNote: v }),
  },
  {
    label: "assessment complete, a level as the coach typed it",
    builder: "buildAssessmentCompleteEmail",
    render: (v, w) => buildAssessmentCompleteEmail({ name: v, participantName: w, levelLabel: v, coachNote: v }),
  },
  {
    label: "e-transfer instructions, the card link carrying the request's invite token",
    builder: "buildEtransferInstructionsEmail",
    render: (v, w) =>
      buildEtransferInstructionsEmail({
        firstName: w,
        programTitle: v,
        cohortLabel: v,
        priceCents: 20000,
        creditCents: 2000,
        amountCents: 18000,
        recipientEmail: "info@tennisbootcamp.ca",
        memo: v,
        cardUrl: `${SITE}/enroll/c1?invite=${v}`,
      }),
  },
  {
    label: "payment received",
    builder: "buildPaymentReceivedEmail",
    render: (v, w) => buildPaymentReceivedEmail({ participantName: w, programTitle: v, cohortLabel: v, amountCents: 20000 }),
  },
  {
    label: "enrolled, paid",
    builder: "buildEnrolledEmail",
    render: (v, w) => buildEnrolledEmail({ name: v, participantName: w, programTitle: v, cohortLabel: v, paid: true }),
  },
  {
    label: "enrolled, e-transfer on its way",
    builder: "buildEnrolledEmail",
    render: (v, w) => buildEnrolledEmail({ name: v, participantName: w, programTitle: v, cohortLabel: v, paid: false }),
  },
  {
    label: "account set-up, paid",
    builder: "buildAccountSetupEmail",
    render: (v, w) =>
      buildAccountSetupEmail({ playerNames: v === w ? [v] : [v, w], programTitle: v, cohortLabel: v, paid: true, link: SETUP_LINK }),
  },
  {
    label: "account set-up, e-transfer on its way",
    builder: "buildAccountSetupEmail",
    render: (v, w) =>
      buildAccountSetupEmail({ playerNames: v === w ? [v] : [v, w], programTitle: v, cohortLabel: v, paid: false, link: SETUP_LINK }),
  },
  {
    label: "e-transfer pending, to the coach's inbox",
    builder: "buildEtransferPendingAdminEmail",
    render: (v, w) =>
      buildEtransferPendingAdminEmail({ playerName: w, playerEmail: v, cohortLabel: v, cohortId: "c1", amountCents: 20000, memo: v }),
  },
  {
    label: "payment matched no invite, to the coach's inbox",
    builder: "buildPaymentUnmatchedAdminEmail",
    render: (v) =>
      buildPaymentUnmatchedAdminEmail({ sessionId: "cs_test_123", cohortLabel: v, cohortId: "c1", playerIndex: 2, playerCount: 2, payerEmail: v }),
  },
];

/** Builders with no typed field, and why. */
const NO_TYPED_FIELD: Record<string, string> = {
  buildLinkEmail: "its subject, link and button label come from the two routes that send it",
};

// ─── 1. The helper ────────────────────────────────────────────────────────────

console.log("escapeHtml");
check(
  "the five characters become entities",
  escapeHtml(`<a href="x">Tom & Jerry's</a>`),
  "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;"
);
check("every other character stays as typed", escapeHtml("Zoë Ana-María Lê Văn · – —"), "Zoë Ana-María Lê Văn · – —");
check("a missing value is empty", [escapeHtml(null), escapeHtml(undefined), escapeHtml("")], ["", "", ""]);
check("it escapes whatever it is given, so a value is escaped once, where it enters the HTML", escapeHtml("&amp;"), "&amp;amp;");

// ─── 2. Every builder, with hostile input ─────────────────────────────────────

const HOSTILE = ['<a href="https://x.test">x</a>', "<img src=x>", '"><b>'];

console.log("Every builder, with a link, an image and a broken attribute in every typed field");
for (const c of CASES) {
  const bad = { tags: [] as string[], live: [] as string[], shown: [] as string[], text: [] as string[], subject: [] as string[] };
  HOSTILE.forEach((input, i) => {
    const other = HOSTILE[(i + 1) % HOSTILE.length];
    const variants: [string, string, string, string, string][] = [
      ["the holder", input, input, "Plain", "Plain"],
      ["another player", input, other, "Plain", "Other"],
    ];
    for (const [who, v, w, plainV, plainW] of variants) {
      const email = c.render(v, w);
      const plain = c.render(plainV, plainW);
      const where = `${who}: ${input}`;
      if (JSON.stringify(tagShapes(email.html)) !== JSON.stringify(tagShapes(plain.html))) bad.tags.push(where);
      if (liveInputTags(email.html).length > 0) bad.live.push(`${where} → ${liveInputTags(email.html).join(" ")}`);
      if (![v, w].some((x) => visibleText(email.html).includes(firstWord(x)))) bad.shown.push(where);
      if (![v, w].some((x) => email.text.includes(firstWord(x))) || ENTITY.test(email.text)) bad.text.push(where);
      if (ENTITY.test(email.subject) || LINE_BREAK.test(email.subject)) bad.subject.push(`${where} → ${email.subject}`);
    }
  });
  check(`${c.label}: the HTML has the template's tags and no others`, bad.tags, []);
  check(`${c.label}: no link, image or bold from the input is live`, bad.live, []);
  check(`${c.label}: the input shows in the inbox as text`, bad.shown, []);
  check(`${c.label}: the plain text keeps it as typed`, bad.text, []);
  check(`${c.label}: the subject keeps it as typed, on one line`, bad.subject, []);
}

{
  // The booking request reaches the coach's inbox: a button typed into the
  // note stays text, so the email links exactly what it links without it.
  const fake = '<a href="https://x.test" style="background:#B4E655">Open requests →</a>';
  const request = (note: string) =>
    buildAssessmentRequestAdminEmail({ name: "Maya Chen", email: "maya@example.com", note, preferredTimes: [] }).html;
  const links = (html: string) => html.match(/<a\s[^>]*>/g) ?? [];
  check("a fake button typed into the request's note adds no link: the links are the app's own", links(request(fake)), links(request("Plain")));
  check("…and the coach reads the note as typed", visibleText(request(fake)).includes(fake));
}

console.log("A line break typed into a name or a label leaves the subject one line");
{
  const broken = "Maya\u{85}Chen\r\nLee\nNg\u{2028}Ko\u{2029}Li\vAn\fOh";
  const brokenOther = "Leo\u{85}Park\r\nKim";
  for (const c of CASES) {
    const subjects = [c.render(broken, broken).subject, c.render(broken, brokenOther).subject];
    check(`${c.label}: one line`, subjects.filter((s) => LINE_BREAK.test(s)), []);
  }
  check(
    "a full name keeps its words, a space where the break was",
    buildAssessmentRequestAdminEmail({ name: "Maya\r\nChen", email: "maya@example.com", preferredTimes: [] }).subject,
    "New assessment request: Maya Chen"
  );
  check(
    "a first name joined by NEL, which does not split a word, still reads on one line",
    buildRecommendationEmail("Maya\u{85}Chen", [recommendation], null).subject,
    "Your Tennis Bootcamp answers are in — Maya Chen"
  );
  check(
    "the plain text keeps the name as typed",
    buildAssessmentRequestAdminEmail({ name: "Maya\r\nChen", email: "maya@example.com", preferredTimes: [] }).text.includes("Maya\r\nChen")
  );
}

// ─── 3. Names read as typed ───────────────────────────────────────────────────

const NAMES = ["O'Neil", "Zoë", "Ana-María", "Lê Văn"];

console.log("O'Neil, Zoë, Ana-María and Lê Văn read as typed");
for (const c of CASES) {
  const bad: string[] = [];
  for (const typed of NAMES) {
    const email = c.render(typed, typed);
    const shown = visibleText(email.html);
    const word = firstWord(typed);
    if (!shown.includes(word)) bad.push(`${typed}: not in what the inbox shows`);
    if (!email.html.includes(escapeHtml(word))) bad.push(`${typed}: not escaped exactly once, accents as typed`);
    if (ENTITY.test(shown)) bad.push(`${typed}: an entity shows in the inbox`);
    if (!email.text.includes(word) || ENTITY.test(email.text)) bad.push(`${typed}: the plain text changed it`);
    if (ENTITY.test(email.subject)) bad.push(`${typed}: the subject escaped it`);
  }
  check(`${c.label}`, bad, []);
}
check(
  "the quiz subject reads O'Neil, never O&#39;Neil",
  buildRecommendationEmail("O'Neil Smith", [recommendation], null).subject,
  "Your Tennis Bootcamp answers are in — O'Neil"
);
check(
  "the coach's subject carries a full name as typed",
  buildAssessmentRequestAdminEmail({ name: "Lê Văn", email: "le@example.com", preferredTimes: [] }).subject,
  "New assessment request: Lê Văn"
);
{
  const child = buildRecommendationEmail("Maya Chen", [recommendation], "Novice", "O'Neil").html;
  check("a player's possessive reads right in the inbox", visibleText(child).includes("O'Neil's likely tier is Novice") && child.includes("O&#39;Neil's likely tier"));
  const setup = buildAccountSetupEmail({ playerNames: ["Ana-María", "Lê Văn"], programTitle: "Youth Bootcamps", cohortLabel: "Fall A", paid: true, link: SETUP_LINK });
  check("full names read as typed in the set-up email", visibleText(setup.html).includes("Ana-María and Lê Văn are enrolled in Youth Bootcamps — Fall A"));
}

// ─── 4. The links the app makes ───────────────────────────────────────────────

console.log("The links the app makes still work");
{
  const setup = buildAccountSetupEmail({ playerNames: HOSTILE, programTitle: "Adult Bootcamps", cohortLabel: "Fall A", paid: true, link: SETUP_LINK });
  check("the set-password button opens the app's link, & and all, beside typed names", setup.html.includes(`href="${SETUP_LINK}"`) && setup.text.includes(SETUP_LINK));
  check("the link email's button opens the link it was given", buildLinkEmail("Set your password for Tennis Bootcamp", SETUP_LINK, "set your password").html.includes(`href="${SETUP_LINK}"`));
  const invite = buildCohortInviteEmail({ ...INVITE, participantName: HOSTILE[0], cohortLabel: HOSTILE[1] });
  check("the invitation's Claim my spot opens the enroll link", invite.html.includes(`href="${ENROLL_URL}"`));
  check("the invitation's price stays the app's HTML", invite.html.includes('= <strong style="color:#fff;">$180</strong>'));
  const card = (token: string) =>
    buildEtransferInstructionsEmail({
      firstName: "Maya",
      programTitle: "Adult Bootcamps",
      cohortLabel: "Fall A",
      priceCents: 20000,
      creditCents: 0,
      amountCents: 20000,
      recipientEmail: "info@tennisbootcamp.ca",
      memo: "Maya Chen – Fall A",
      cardUrl: `${SITE}/enroll/c1?invite=${token}`,
    }).html;
  check("the card link with a real token is unchanged", card("tok123").includes(`href="${SITE}/enroll/c1?invite=tok123"`));
  const typedHref = card('"><b>').match(/<a href="([^"]*)"[^>]*>Pay by card instead<\/a>/)?.[1];
  check("the card link with a typed token stays one attribute and opens the same address", typedHref !== undefined && decode(typedHref) === `${SITE}/enroll/c1?invite="><b>`);
}

// ─── 5. Coverage ──────────────────────────────────────────────────────────────

console.log("Every builder is rendered here");
{
  const source = read("src/lib/emailBodies.ts");
  const builders = (src: string) => [...src.matchAll(/^export function (build\w+Email)\(/gm)].map((m) => m[1]);
  const exported = builders(source);
  check("the builder list reads the same with either line ending", builders(source.replace(/\n/g, "\r\n")), exported);
  check("the file exports builders to check", exported.length > 10, true);
  const covered = new Set([...CASES.map((c) => c.builder), ...Object.keys(NO_TYPED_FIELD)]);
  check("every exported builder is rendered here, or has no typed field", exported.filter((b) => !covered.has(b)), []);
  check("…and every builder named here is one the file exports", [...covered].filter((b) => !exported.includes(b)), []);
  check("the builders escape with the one helper", source.includes('import { escapeHtml } from "@/lib/escapeHtml";') && !/function\s+escape/i.test(source));
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("this script is in the npm test chain", pkg.scripts.test.includes("src/scripts/test-email-escaping.ts"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll email-escaping tests passed.");

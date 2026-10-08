// Run from project root: npx tsx src/scripts/test-privacy.ts
// Pins backlog #23: GA never sees an invite token while utm_*, gclid and
// fbclid reach it untouched, and every email to a player carries the CASL
// sender and unsubscribe lines (the link email and emails to Sina don't).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withoutInvite, GA_STRIP_QUERY_SCRIPT, gaInitScript, trackEvent, trackEnrollStart } from "../lib/analytics";
import { senderLine, unsubscribeLine, commercialFooterText } from "../lib/casl";
import type { Recommendation } from "../lib/recommend";
import {
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
  buildEtransferPendingAdminEmail,
} from "../lib/emailBodies";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
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

// Each case: what the browser holds → what GA may see. invite goes, everything
// else (ad attribution above all) stays byte for byte.
const URL_CASES: [string, string, string][] = [
  [
    "invite token removed, no trailing ?",
    "https://tennisbootcamp.ca/enroll/abc?invite=tok123",
    "https://tennisbootcamp.ca/enroll/abc",
  ],
  [
    "utm_source and gclid kept around a removed invite",
    "https://tennisbootcamp.ca/enroll/abc?utm_source=google&invite=tok123&gclid=Cj0KCQ",
    "https://tennisbootcamp.ca/enroll/abc?utm_source=google&gclid=Cj0KCQ",
  ],
  [
    "every other parameter kept untouched",
    "https://tennisbootcamp.ca/intake?utm_source=ig&utm_medium=paid&utm_campaign=fall%20launch&fbclid=IwAR1&program=youth",
    "https://tennisbootcamp.ca/intake?utm_source=ig&utm_medium=paid&utm_campaign=fall%20launch&fbclid=IwAR1&program=youth",
  ],
  [
    "Stripe return keeps row, drops invite=1",
    "https://tennisbootcamp.ca/enroll/abc/confirmed?row=4&invite=1",
    "https://tennisbootcamp.ca/enroll/abc/confirmed?row=4",
  ],
  [
    "encoded and empty invite keys removed",
    "https://tennisbootcamp.ca/enroll/abc?%69nvite=tok123&invite&gclid=x",
    "https://tennisbootcamp.ca/enroll/abc?gclid=x",
  ],
  [
    "hash dropped",
    "https://tennisbootcamp.ca/programs?utm_source=ig#fall",
    "https://tennisbootcamp.ca/programs?utm_source=ig",
  ],
  ["no query stays as is", "https://tennisbootcamp.ca/programs", "https://tennisbootcamp.ca/programs"],
  ["empty referrer stays empty", "", ""],
];

console.log("withoutInvite");
for (const [name, input, expected] of URL_CASES) check(name, withoutInvite(input), expected);

// The inline script runs before the bundle; run it against a fake window and
// read what it hands gtag. Same cases, so the two copies can't drift.
function runStripScript(href: string, referrer: string): unknown[][] {
  const fakeWindow: { dataLayer?: IArguments[]; location: { href: string } } = {
    location: { href },
  };
  new Function("window", "document", GA_STRIP_QUERY_SCRIPT)(fakeWindow, { referrer });
  return (fakeWindow.dataLayer ?? []).map((args) => Array.from(args));
}

console.log("GA_STRIP_QUERY_SCRIPT");
for (const [name, input, expected] of URL_CASES) {
  const pushed = runStripScript(input || "https://tennisbootcamp.ca/", input);
  check(`${name} (script, referrer)`, (pushed[0]?.[1] as { page_referrer: string }).page_referrer, expected);
}
const pushed = runStripScript(
  "https://tennisbootcamp.ca/enroll/abc?invite=tok123&utm_source=email",
  "https://tennisbootcamp.ca/legal/waiver?invite=tok123"
);
check("sets trimmed location and referrer before config", pushed, [
  [
    "set",
    {
      page_location: "https://tennisbootcamp.ca/enroll/abc?utm_source=email",
      page_referrer: "https://tennisbootcamp.ca/legal/waiver",
    },
  ],
]);
check("no invite= anywhere in what GA receives", JSON.stringify(pushed).includes("invite="), false);

// The live bootstrap: one script, so the trim can't be skipped (a notFound()
// page dropped the old separate beforeInteractive script and leaked the token).
console.log("gaInitScript");
{
  const fakeWindow: { dataLayer?: IArguments[]; location: { href: string } } = {
    location: { href: "https://tennisbootcamp.ca/enroll/gone?invite=tok123" },
  };
  new Function("window", "document", gaInitScript("G-TEST123"))(fakeWindow, { referrer: "" });
  const cmds = (fakeWindow.dataLayer ?? []).map((args) => Array.from(args));
  check("order is set, js, config", cmds.map((c) => c[0]), ["set", "js", "config"]);
  check("config names the GA id", cmds[2], ["config", "G-TEST123"]);
  check("trimmed before config", (cmds[0][1] as { page_location: string }).page_location, "https://tennisbootcamp.ca/enroll/gone");
  check("no invite= in the bootstrap's commands", JSON.stringify(cmds).includes("invite="), false);
}

// The bootstrap runs afterInteractive, so a child effect (enroll_start) can
// queue an event before it. The helper must put a trimmed set ahead of the
// first command it sends, whatever the timing.
console.log("trackEvent queues a trimmed set first");
{
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  const savedGaId = process.env.NEXT_PUBLIC_GA_ID;
  const fakeWindow: { dataLayer?: IArguments[]; location: { href: string } } = {
    location: { href: "https://tennisbootcamp.ca/enroll/abc?invite=tok123&utm_source=email&gclid=Cj0" },
  };
  g.window = fakeWindow;
  g.document = { referrer: "https://tennisbootcamp.ca/legal/waiver?invite=tok123&fbclid=IwAR1" };

  delete process.env.NEXT_PUBLIC_GA_ID;
  trackEvent("enroll_start", { cohort_id: "abc" });
  check("no-op when NEXT_PUBLIC_GA_ID is unset", fakeWindow.dataLayer ?? [], []);

  process.env.NEXT_PUBLIC_GA_ID = "G-TEST123";
  trackEvent("enroll_start", { cohort_id: "abc" });
  trackEvent("enroll_continue_to_payment", { cohort_id: "abc" });
  const queued = fakeWindow.dataLayer ?? [];
  check("each entry is an arguments object", queued.every((a) => Object.prototype.toString.call(a) === "[object Arguments]"), true);
  const cmds = queued.map((args) => Array.from(args));
  check("set lands before the first event, once", cmds.map((c) => c[0]), ["set", "event", "event"]);
  check("trimmed set keeps utm/gclid/fbclid", cmds[0], [
    "set",
    {
      page_location: "https://tennisbootcamp.ca/enroll/abc?utm_source=email&gclid=Cj0",
      page_referrer: "https://tennisbootcamp.ca/legal/waiver?fbclid=IwAR1",
    },
  ]);
  check("no page_view queued by the helper", cmds.some((c) => c[1] === "page_view"), false);
  check("no invite= in anything queued", JSON.stringify(cmds).includes("invite="), false);

  // In-site link: GA's set still holds the previous page when the wizard's
  // effect runs, so enroll_start names its own (trimmed) location.
  fakeWindow.location.href = "https://tennisbootcamp.ca/enroll/xyz?invite=tok456&utm_source=email";
  const before = fakeWindow.dataLayer?.length ?? 0;
  trackEnrollStart("xyz", "Adult Bootcamps");
  const enrollCmds = (fakeWindow.dataLayer ?? []).slice(before).map((args) => Array.from(args));
  check("enroll_start sends one event", enrollCmds.map((c) => c[0]), ["event"]);
  check("enroll_start carries its own trimmed page_location", enrollCmds[0], [
    "event",
    "enroll_start",
    {
      cohort_id: "xyz",
      program: "Adult Bootcamps",
      page_location: "https://tennisbootcamp.ca/enroll/xyz?utm_source=email",
    },
  ]);
  check("no invite in enroll_start's page_location", JSON.stringify(enrollCmds).includes("invite"), false);

  if (savedGaId === undefined) delete process.env.NEXT_PUBLIC_GA_ID;
  else process.env.NEXT_PUBLIC_GA_ID = savedGaId;
  delete g.window;
  delete g.document;
}

// The live layout must boot GA through gaInitScript (trim, js, config in one
// script), not the third-party component that skipped the trim.
console.log("layout.tsx boots GA through gaInitScript");
{
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  check("layout calls gaInitScript", /gaInitScript\(/.test(layout), true);
  check("layout doesn't use @next/third-parties", layout.includes("@next/third-parties"), false);
}

// ─── CASL sender and unsubscribe lines, in the emails themselves ─────────────
// Every email to a player carries both lines in HTML and text (invitations
// with their own unsubscribe wording). The password/activation link email and
// the emails to Sina carry neither. These render the real bodies, so removing
// a footer call fails here.

const SENDER_NO_ADDRESS = "Sent by Sina Kassaian (Tennis Bootcamp), info@tennisbootcamp.ca.";
const UNSUB_GENERAL =
  "Don't want emails like this? Reply to this email or write to info@tennisbootcamp.ca and we'll stop sending them.";
const UNSUB_INVITE =
  "Don't want invitations to groups? Reply to this email or write to info@tennisbootcamp.ca and we'll stop sending them.";

console.log("CASL lines");
const savedAddress = process.env.BUSINESS_MAILING_ADDRESS;
delete process.env.BUSINESS_MAILING_ADDRESS;
check("sender line, BUSINESS_MAILING_ADDRESS unset", senderLine(), SENDER_NO_ADDRESS);
process.env.BUSINESS_MAILING_ADDRESS = "   ";
check("sender line, BUSINESS_MAILING_ADDRESS blank", senderLine(), SENDER_NO_ADDRESS);
process.env.BUSINESS_MAILING_ADDRESS = "  123 Court St, Toronto ON  ";
check(
  "sender line, BUSINESS_MAILING_ADDRESS set (trimmed)",
  senderLine(),
  "Sent by Sina Kassaian (Tennis Bootcamp), 123 Court St, Toronto ON, info@tennisbootcamp.ca."
);
delete process.env.BUSINESS_MAILING_ADDRESS;
check("general unsubscribe line", unsubscribeLine("general"), UNSUB_GENERAL);
check("invitation unsubscribe line", unsubscribeLine("invitation"), UNSUB_INVITE);
check(
  "text footer carries both",
  commercialFooterText("invitation"),
  `${SENDER_NO_ADDRESS}\n${UNSUB_INVITE}`
);

const recommendation = {
  program: { title: "Adult Bootcamps" },
  score: 1,
  reason: "",
} as unknown as Recommendation;

const PLAYER_EMAILS: [string, () => EmailBody, string][] = [
  [
    "quiz result",
    () => buildRecommendationEmail("Maya Chen", [recommendation], "3.0"),
    UNSUB_GENERAL,
  ],
  [
    "assessment booking confirmation",
    () =>
      buildBookingConfirmationEmail({
        name: "Maya Chen",
        dateLabel: "Sat Oct 10",
        timeLabel: "9:00am",
      }),
    UNSUB_GENERAL,
  ],
  [
    "assessment request received",
    () => buildAssessmentRequestReceivedEmail({ name: "Maya Chen", participantName: "Leo Chen" }),
    UNSUB_GENERAL,
  ],
  [
    "assessment complete",
    () =>
      buildAssessmentCompleteEmail({
        name: "Maya Chen",
        levelLabel: "3.0",
        coachNote: "Solid forehand; work on the second serve.",
      }),
    UNSUB_GENERAL,
  ],
  [
    "cohort invitation",
    () =>
      buildCohortInviteEmail({
        participantName: null,
        levelLabel: "3.0",
        tierNames: ["Deuce"],
        programTitle: "Adult Bootcamps",
        cohortLabel: "Fall A",
        dayTimeLabel: "Saturdays 9–10am",
        startDateLabel: "Oct 17",
        weeks: 6,
        priceCents: 21000,
        creditCents: 2000,
        holdHours: 48,
        enrollUrl: "https://tennisbootcamp.ca/enroll/abc?invite=tok123",
      }),
    UNSUB_INVITE,
  ],
  [
    "cohort confirmed",
    () =>
      buildCohortConfirmedEmail({
        cohortLabel: "Fall A",
        programTitle: "Adult Bootcamps",
        startDateLabel: "Oct 17",
        sessionLines: ["Sat Oct 17 · 9–10am"],
      }),
    UNSUB_GENERAL,
  ],
  [
    "session cancelled (make-up)",
    () =>
      buildSessionCancelledEmail({
        cohortLabel: "Fall A",
        dateLabel: "Saturday, October 24",
        reasonLine: "Rain closed the courts.",
        makeup: { dateLabel: "Saturday, November 28", newEndDateLabel: "November 28" },
        makeupMaxWeeks: 2,
      }),
    UNSUB_GENERAL,
  ],
  [
    "session cancelled (credit)",
    () =>
      buildSessionCancelledEmail({
        cohortLabel: "Fall A",
        dateLabel: "Saturday, October 24",
        reasonLine: "Rain closed the courts.",
        makeup: null,
        makeupMaxWeeks: 2,
      }),
    UNSUB_GENERAL,
  ],
  [
    "e-transfer instructions",
    () =>
      buildEtransferInstructionsEmail({
        firstName: "Maya",
        programTitle: "Adult Bootcamps",
        cohortLabel: "Fall A",
        priceCents: 21000,
        creditCents: 0,
        amountCents: 21000,
        recipientEmail: "info@tennisbootcamp.ca",
        memo: "TB-FALLA-MAYA",
        cardUrl: "https://tennisbootcamp.ca/enroll/abc?invite=tok123",
      }),
    UNSUB_GENERAL,
  ],
  [
    "payment received",
    () =>
      buildPaymentReceivedEmail({
        programTitle: "Adult Bootcamps",
        cohortLabel: "Fall A",
        amountCents: 21000,
      }),
    UNSUB_GENERAL,
  ],
];

const NO_FOOTER_EMAILS: [string, () => EmailBody][] = [
  [
    "password/activation link",
    () => buildLinkEmail("Set your password", "https://tennisbootcamp.ca/auth/x", "set your password"),
  ],
  [
    "assessment request → Sina",
    () =>
      buildAssessmentRequestAdminEmail({
        name: "Maya Chen",
        email: "maya@example.com",
        preferredTimes: ["Sat am"],
      }),
  ],
  [
    "e-transfer pending → Sina",
    () =>
      buildEtransferPendingAdminEmail({
        playerName: "Maya Chen",
        playerEmail: "maya@example.com",
        cohortLabel: "Fall A",
        cohortId: "c1",
        amountCents: 21000,
        memo: "TB-FALLA-MAYA",
      }),
  ],
];

console.log("Emails to players carry the sender and unsubscribe lines (address unset)");
for (const [name, build, unsub] of PLAYER_EMAILS) {
  const { html, text } = build();
  check(`${name}: HTML sender line`, html.includes(SENDER_NO_ADDRESS), true);
  check(`${name}: HTML unsubscribe line`, html.includes(unsub), true);
  check(`${name}: text sender line`, text.includes(SENDER_NO_ADDRESS), true);
  check(`${name}: text unsubscribe line`, text.includes(unsub), true);
  check(`${name}: no empty address segment`, /, ,|\(Tennis Bootcamp\), ,/.test(html + text), false);
}

console.log("Emails to players with BUSINESS_MAILING_ADDRESS set");
process.env.BUSINESS_MAILING_ADDRESS = "123 Court St, Toronto ON";
for (const [name, build] of PLAYER_EMAILS) {
  const { html, text } = build();
  const withAddress =
    "Sent by Sina Kassaian (Tennis Bootcamp), 123 Court St, Toronto ON, info@tennisbootcamp.ca.";
  check(`${name}: address in HTML and text`, html.includes(withAddress) && text.includes(withAddress), true);
}
if (savedAddress === undefined) delete process.env.BUSINESS_MAILING_ADDRESS;
else process.env.BUSINESS_MAILING_ADDRESS = savedAddress;

console.log("Link email and emails to Sina carry no footer");
for (const [name, build] of NO_FOOTER_EMAILS) {
  const { html, text } = build();
  check(`${name}: no sender line`, (html + text).includes("Sent by Sina Kassaian"), false);
  check(`${name}: no unsubscribe line`, (html + text).includes("Don't want"), false);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll privacy checks passed");

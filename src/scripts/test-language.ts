// Run from project root: npx tsx src/scripts/test-language.ts
// Pins audit item J (owner decisions 2026-10-12, QA 2026-10-10):
//   1. plain tier names everywhere, the old slugs redirecting, and the quiz's
//      "Tournament player" answer (stored values unchanged);
//   2. staff wording: the site and every email speak for "our coaches" and
//      sign off as the coaching team; the coach's name stays only on the
//      coach card and in the legally required supplier lines;
//   3. the coach title on the card, the About page and the JSON-LD;
//   4. the QA quick fixes: the mobile menu locks the root only, /assessment's
//      buttons are the outline secondary, the newsletter promises only what
//      its form can keep, and the hero scrim and dot size.
// Exits non-zero on any failure.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  LEGACY_TIER_SLUGS,
  LEVEL_OPTIONS,
  TIERS,
  TIER_LADDER_SPAN,
  withArticle,
} from "../lib/tiers";
import { SELF_LEVELS, provisionalTierFor } from "../lib/level";
import { coaches } from "../content/coaches";
import nextConfig, { TIER_EMBLEM_REDIRECTS } from "../../next.config";
import type { Recommendation } from "../lib/recommend";
import {
  type EmailBody,
  SIGN_OFF_NAME,
  buildLinkEmail,
  buildRecommendationEmail,
  buildBookingConfirmationEmail,
  buildAssessmentRequestReceivedEmail,
  buildCohortInviteEmail,
  buildCohortConfirmedEmail,
  buildSessionCancelledEmail,
  buildAssessmentCompleteEmail,
  buildEtransferInstructionsEmail,
  buildPaymentReceivedEmail,
  buildEnrolledEmail,
  buildAccountSetupEmail,
} from "../lib/emailBodies";
import { senderLine } from "../lib/casl";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Every .ts/.tsx file under a source directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** The code without block comments, JSX comments and whole-line // comments. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// Everything a visitor, player or parent can read is built from these.
const USER_FACING = ["src/app", "src/components", "src/lib", "src/content"]
  .flatMap(sourceFiles)
  .map((f) => relative(ROOT, join(ROOT, f)).replace(/\\/g, "/"));

async function main() {
// ── 1. Plain tier names ─────────────────────────────────────────────────────
console.log("Plain tier names (owner, 2026-10-12; five tiers, 2026-10-13)");
check(
  "the five names, low to high",
  TIERS.map((t) => t.name).join("|") === "Beginner|Novice|Intermediate|Advanced|High Performance"
);
check(
  "the five slugs follow the names",
  TIERS.map((t) => t.slug).join("|") === "beginner|novice|intermediate|advanced|high-performance"
);
check("the numbers did not move: Intermediate is 3.0–3.5, High Performance 5.0–7.0", TIERS[2].band === "3.0–3.5" && TIERS[4].band === "5.0–7.0");
check("the colours: slate, light slate, lime secondary, lime primary, gold", TIERS.map((t) => t.color).join(",") === "#7D8CA3,#AEBBCD,#8CC63F,#B4E655,#E3C46F");
check('TIER_LADDER_SPAN is "Beginner to High Performance"', TIER_LADDER_SPAN === "Beginner to High Performance");
check(
  "admin level picker reads the plain names",
  LEVEL_OPTIONS[0].label === "1.0 · Beginner" && LEVEL_OPTIONS[4].label === "3.0 · Intermediate" && LEVEL_OPTIONS[12].label === "7.0 · High Performance"
);
check(
  "a/an before a tier-led phrase",
  withArticle("Beginner group") === "a Beginner group" &&
    withArticle("Novice – Intermediate group") === "a Novice – Intermediate group" &&
    withArticle("Intermediate group") === "an Intermediate group" &&
    withArticle("Advanced and up group") === "an Advanced and up group" &&
    withArticle("High Performance group") === "a High Performance group"
);

console.log("Old slugs redirect (tier-emblem PNGs in sent emails)");
const OLD_TO_NEW: [string, string][] = [
  ["love", "beginner"], ["rally", "novice"], ["deuce", "intermediate"], ["break", "advanced"],
  ["ace", "high-performance"], ["match-point", "high-performance"], ["grand-slam", "high-performance"],
  ["elite", "high-performance"], ["pro", "high-performance"], ["world-class", "high-performance"],
];
const OLD = OLD_TO_NEW.map(([old]) => old);
check("every retired slug maps to its live tier, 5.0 and up to high-performance", OLD_TO_NEW.every(([old, live]) => LEGACY_TIER_SLUGS[old] === live) && Object.keys(LEGACY_TIER_SLUGS).length === OLD.length);
check("every target is a live slug", Object.values(LEGACY_TIER_SLUGS).every((slug) => TIERS.some((t) => t.slug === slug)));
check("no retired slug is a live slug", Object.keys(LEGACY_TIER_SLUGS).every((old) => !TIERS.some((t) => t.slug === old)));
check(
  "next.config.ts redirects each one permanently to /tier-emblem/{live}",
  TIER_EMBLEM_REDIRECTS.length === OLD.length &&
    OLD_TO_NEW.every(([old, live]) =>
      TIER_EMBLEM_REDIRECTS.some((r) => r.source === `/tier-emblem/${old}` && r.destination === `/tier-emblem/${live}` && r.permanent === true)
    )
);
{
  // The config actually serves them (not only exports them).
  const served = nextConfig.redirects ? await nextConfig.redirects() : [];
  check("the config's redirects() returns the tier redirects", OLD.every((old) => served.some((r) => r.source === `/tier-emblem/${old}`)));
}
const route = read("src/app/tier-emblem/[slug]/route.tsx");
check("the PNG route is static over the live slugs only", route.includes("TIERS.map((t) => ({ slug: t.slug }))") && route.includes("export const dynamicParams = false"));

console.log("No retired tier name reaches a reader");
// "Deuce and ad side" is the court's side on the admin art gallery, not a tier.
const RETIRED = /\b(Love|Deuce|Match Point|Grand Slam|World Class)\b/;
const retiredHits = USER_FACING.flatMap((f) =>
  withoutComments(read(f))
    .split("\n")
    .filter((l) => RETIRED.test(l) && !l.includes("Deuce and ad side"))
    .map((l) => `${f}: ${l.trim().slice(0, 90)}`)
);
check("no Love, Deuce, Match Point, Grand Slam or World Class outside comments", retiredHits.length === 0, retiredHits.join(" | "));
check("no hard-coded 'You're a {tier}' sentence in the emails", !/a \$\{tier\.name\}/.test(read("src/lib/emailBodies.ts")));

console.log("The quiz self-estimate (stored values unchanged)");
check(
  "stored values are the intake contract's",
  SELF_LEVELS.map((o) => o.value).join("|") === "|new|rally|competitive|elite|unsure"
);
const elite = SELF_LEVELS.find((o) => o.value === "elite");
check('"elite" reads "Tournament player" for self and others', elite?.label === "Tournament player" && elite?.labelOther === "Tournament player");
const tierWord = new RegExp(`\\b(${TIERS.map((t) => t.name).join("|")})\\b`, "i");
check("no quiz answer reuses a tier name", SELF_LEVELS.every((o) => !tierWord.test(o.label) && !tierWord.test(o.labelOther)));
check(
  "provisional map: new → Beginner, rally → Novice, competitive → Intermediate, elite → Advanced",
  provisionalTierFor("new")?.name === "Beginner" &&
    provisionalTierFor("rally")?.name === "Novice" &&
    provisionalTierFor("competitive")?.name === "Intermediate" &&
    provisionalTierFor("elite")?.name === "Advanced" &&
    provisionalTierFor("unsure") === null &&
    provisionalTierFor("") === null
);

// ── 2. Staff wording ────────────────────────────────────────────────────────
console.log("Staff wording: no coach is named outside the coach card and legal lines");
// The coach card (coaches.ts, read by the home card and the About founder
// section), the CASL supplier name (business.ts) and legal text keep the name.
// The admin is the coach's own tool.
const NAME_ALLOWED = (f: string) =>
  f === "src/content/coaches.ts" ||
  f === "src/content/business.ts" ||
  f.startsWith("src/app/legal/") ||
  f.startsWith("src/app/admin/") ||
  f === "src/app/about/page.tsx";
const nameHits = USER_FACING.filter((f) => !NAME_ALLOWED(f)).flatMap((f) =>
  withoutComments(read(f))
    .split("\n")
    .filter((l) => /\b(Sina|Kassaian)\b|Head Coach/.test(l))
    .map((l) => `${f}: ${l.trim().slice(0, 90)}`)
);
check("no Sina, Kassaian or Head Coach in user-facing code", nameHits.length === 0, nameHits.join(" | "));
{
  // On About, the name appears only inside the founder section (the coach card).
  const about = read("src/app/about/page.tsx");
  const start = about.indexOf("── Founder");
  const end = about.indexOf("── Closing CTA");
  const outside = withoutComments(about.slice(0, start) + about.slice(end));
  check("About: the name only in the founder section", start > 0 && end > start && !/\bSina\b|Head Coach/.test(outside));
  check("About: the founder heading and title come from coaches.ts", about.includes("{lead.name}") && about.includes("{lead.role}"));
}
check("the placement line is the team's", read("src/components/sections/TrustBar.tsx").includes('label: "Placed by our coaches"'));
check("site meta: our coaches place you", read("src/content/site.ts").includes("Take the 2-minute quiz and our coaches place you."));

console.log("Emails: the coaching team signs, and nobody says I");
const recommendation = { program: { title: "Adult Bootcamps" }, score: 1, reason: "" } as unknown as Recommendation;
const EMAILS: [string, () => EmailBody][] = [
  ["password link", () => buildLinkEmail("Set your password", "https://tennisbootcamp.ca/auth/x", "set your password")],
  ["quiz result", () => buildRecommendationEmail("Maya Chen", [recommendation], "Novice")],
  ["quiz result, a child", () => buildRecommendationEmail("Maya Chen", [recommendation], "Novice", "Leo Chen")],
  ["quiz result, no tier", () => buildRecommendationEmail("Maya Chen", [recommendation], null)],
  ["booking confirmation", () => buildBookingConfirmationEmail({ name: "Maya Chen", dateLabel: "Sat Oct 10", timeLabel: "9:00am" })],
  ["assessment request", () => buildAssessmentRequestReceivedEmail({ name: "Maya Chen" })],
  ["assessment complete", () => buildAssessmentCompleteEmail({ name: "Maya Chen", levelLabel: "4.0", coachNote: "Good feet." })],
  [
    "cohort invitation",
    () =>
      buildCohortInviteEmail({
        participantName: "Alex Kim", levelLabel: "3.0", tierNames: ["Intermediate"], programTitle: "Adult Bootcamps",
        cohortLabel: "Fall A", dayTimeLabel: "Saturdays 9–10am", startDateLabel: "Oct 17", weeks: 6,
        priceCents: 21000, creditCents: 0, holdHours: 48, enrollUrl: "https://tennisbootcamp.ca/enroll/abc?invite=t",
      }),
  ],
  ["cohort confirmed", () => buildCohortConfirmedEmail({ cohortLabel: "Fall A", programTitle: "Adult Bootcamps", startDateLabel: "Oct 17", sessionLines: ["Sat Oct 17 · 9–10am"] })],
  ["session cancelled", () => buildSessionCancelledEmail({ cohortLabel: "Fall A", dateLabel: "Saturday, October 24", reasonLine: "Rain.", makeup: null, makeupMaxWeeks: 2 })],
  [
    "e-transfer instructions",
    () =>
      buildEtransferInstructionsEmail({
        firstName: "Maya", programTitle: "Adult Bootcamps", cohortLabel: "Fall A", priceCents: 21000, creditCents: 0,
        amountCents: 21000, recipientEmail: "info@tennisbootcamp.ca", memo: "TB-FALLA-MAYA", cardUrl: "https://tennisbootcamp.ca/enroll/abc",
      }),
  ],
  ["payment received", () => buildPaymentReceivedEmail({ programTitle: "Adult Bootcamps", cohortLabel: "Fall A", amountCents: 21000 })],
  ["you're enrolled", () => buildEnrolledEmail({ name: "Maya Chen", programTitle: "Adult Bootcamps", cohortLabel: "Fall A", paid: false })],
  ["set up your account", () => buildAccountSetupEmail({ playerNames: ["Maya Chen", "Leo Chen"], programTitle: "Youth Bootcamps", cohortLabel: "Fall A", paid: false, link: "https://tennisbootcamp.ca/auth/x" })],
];
check('the sign-off is "The Tennis Bootcamp coaching team"', SIGN_OFF_NAME === "The Tennis Bootcamp coaching team");
const SENDER = senderLine();
for (const [name, build] of EMAILS) {
  const { subject, html, text } = build();
  // The CASL sender line names the supplier by law; nothing else may.
  const body = (subject + html + text).split(SENDER).join("");
  check(`${name}: signed by the coaching team, HTML and text alike`, html.includes(`See you on the court,<br/>\n    <strong style="color:#fff;">${SIGN_OFF_NAME}</strong>`) && text.includes(`See you on the court,\n${SIGN_OFF_NAME}`));
  check(`${name}: no coach named, no Head Coach`, !/\b(Sina|Kassaian)\b|Head Coach/.test(body));
  check(`${name}: speaks as we, never I`, !/\bI\b|\bme\b/.test(text.replace(/https?:\S+/g, "")));
}
{
  const complete = buildAssessmentCompleteEmail({ name: "Maya Chen", levelLabel: "4.0", coachNote: "Good feet." });
  check("assessment complete: the tier sentence takes no article", complete.text.includes("You're in the Advanced tier.") && !/You're an? (Advanced|Intermediate|Elite)\b/.test(complete.html));
  const [, buildInvite] = EMAILS.find(([n]) => n === "cohort invitation")!;
  const invite = buildInvite();
  check(
    'cohort invitation: "an Adult Bootcamps group", HTML and text alike',
    invite.html.includes("We've built an Adult Bootcamps group") && invite.text.includes("We've built an Adult Bootcamps group") && !/built a Adult/.test(invite.html + invite.text),
  );
}

// ── 3. The coach title ──────────────────────────────────────────────────────
console.log("Coach title (owner, 2026-10-12)");
check("coaches.ts: Program Coordinator / High Performance Coach", coaches[0]?.role === "Program Coordinator / High Performance Coach");
check("the home coach card renders the role from coaches.ts", read("src/components/sections/Coaches.tsx").includes("{c.role}"));
check("JSON-LD carries it as jobTitle", read("src/lib/structuredData.ts").includes("jobTitle: leadCoach.role"));

// ── 4. QA quick fixes (2026-10-10) ──────────────────────────────────────────
console.log("QA quick fixes");
const navbar = read("src/components/layout/Navbar.tsx");
check("mobile menu: locks <html> only, never <body> (header stays at top 0)", navbar.includes('html.style.overflow = "hidden"') && !navbar.includes("document.body.style.overflow"));
const assessment = read("src/app/assessment/page.tsx");
const secondaryBook = assessment.match(/<TrackedButton\s+variant="secondary"\s+href="\/assessment\/book"\s+track="assessment"\s+source="assessment-(price|closing)"[^>]*>\s*Book Your Assessment\s*<\/TrackedButton>/g) ?? [];
check("/assessment: both Book Your Assessment buttons are the outline secondary", secondaryBook.length === 2);
check("/assessment: no solid lime fill on the page (the price card's 6% tint stays)", !/bg-\[#B4E655\](?!\/)/.test(assessment));
const capture = read("src/components/sections/EmailCapture.tsx");
check("newsletter: promises a cohort, not level matching", capture.includes("Be first to know when a new cohort opens") && capture.includes("Leave your email and we&apos;ll tell you when one opens.") && !/matching your level|new sessions open/i.test(capture));
const hero = read("src/components/sections/Hero.tsx");
check("hero: the phone scrim holds 90% navy down through the note", /from-\[#061427\]\/95 from-0% via-\[#061427\]\/90 via-\[72%\] to-\[#061427\]\/35 to-100%/.test(hero));
check("hero: from md the scrim holds 90% across the copy column", /md:from-\[#061427\]\/95 md:from-0% md:via-\[#061427\]\/90 md:via-\[50%\] md:to-transparent md:to-100%/.test(hero));
const wave = read("src/components/ui/CourtBackground.tsx");
check("wave: dots keep their CSS size under the 1.5 ratio cap", wave.includes("const pointScale = pixelRatio / Math.min(window.devicePixelRatio, 2);") && wave.includes("gl_PointSize    = scale * pointScale * (300.0 / -mvPosition.z);") && wave.includes("pointScale: { value: pointScale }"));
check("wave: the owner-locked shape is untouched", wave.includes("Math.sin((fx + count) * 0.3) * 50") && wave.includes("AMOUNTX    = 50"));

// ── voice.md follows the site ──────────────────────────────────────────────
console.log("voice.md");
const voice = read("ops/briefs/voice.md");
check("locks the five plain names", voice.includes("**Beginner, Novice, Intermediate, Advanced, High Performance**") && !voice.includes("Elite, Pro, World Class**"));
check("locks the coach title and the email sign-off", voice.includes("**Program Coordinator / High Performance Coach**") && voice.includes('"The Tennis Bootcamp coaching team"'));
check("has the staff wording section", voice.includes("## Staff wording (owner, 2026-10-12)"));
check("no longer tells anyone that Sina places players", !/Sina places/.test(voice.split("| 15 |")[0]));

if (failed > 0) {
  console.error(`\n${failed} language check(s) failed.`);
  process.exit(1);
}
console.log("\nAll language checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

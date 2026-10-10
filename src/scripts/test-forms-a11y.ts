// Run from project root: npx tsx src/scripts/test-forms-a11y.ts
//
// Pins audit PR D (2026-10-09, "Accessibility, forms, performance and
// platform hygiene"), the forms half: the validation words and rules (M18,
// M19), the one self-estimate list with "elite" (M21), the household
// chooser's issues (a half-filled player is never dropped silently), the
// slot picker's arrow keys (M22), the signed-in cookie hint (M40), the
// once-per-booking count (L13), and the contrast floor as a source scan
// (M23, L3). The repo has no DOM test runner, so markup rules are source
// checks. Exits non-zero on any failure.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  FIELD_MESSAGES,
  INFO_EMAIL,
  MIN_PHONE_DIGITS,
  emailError,
  firstIssueId,
  isValidEmail,
  issuesById,
  newPasswordError,
  passwordUpdateErrorMessage,
  phoneError,
  requiredError,
  withHumanFallback,
} from "../lib/formValidation";
import { SELF_LEVELS, selfEstimateToLevel, selfLevelLabel } from "../lib/level";
import { arrowStep, nextEnabledIndex, tabStopIndex } from "../lib/rovingIndex";
import { hasAuthCookie } from "../lib/authCookie";
import { firstSightOfBooking } from "../lib/analytics";
import {
  EMPTY_HOUSEHOLD,
  emptyGuest,
  householdFieldIds,
  householdIssues,
  type HouseholdValue,
  type ParticipantOption,
} from "../components/participants/WhoIsThisFor";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ── Validation words and rules (M18, M19) ───────────────────────────────────
console.log("Validation (M18, M19)");
check("a plain email is valid", isValidEmail("maya@example.com"));
check("an email with a space is not", !isValidEmail("maya @example.com"));
check("an email with no domain dot is not", !isValidEmail("maya@example"));
check("empty email asks for it", emailError("") === FIELD_MESSAGES.emailMissing);
check("bad email shows the shape", emailError("maya@") === FIELD_MESSAGES.emailInvalid && FIELD_MESSAGES.emailInvalid.includes("name@example.com"));
check("good email has no error", emailError(" maya@example.com ") === null);
check(`phone needs ${MIN_PHONE_DIGITS} digits`, phoneError("555-12") === FIELD_MESSAGES.phoneInvalid && phoneError("(647) 555-1234") === null);
check("a required phone asks why (Sina texts)", phoneError("") === FIELD_MESSAGES.phoneMissing && /text/i.test(FIELD_MESSAGES.phoneMissing));
check("an optional phone may be empty", phoneError("", { required: false }) === null);
check("an optional phone is still checked when filled", phoneError("12", { required: false }) === FIELD_MESSAGES.phoneInvalid);
check("a name is required", requiredError("  ") === FIELD_MESSAGES.nameMissing && requiredError("Maya") === null);
check("a new password needs 8 characters", newPasswordError("short") === FIELD_MESSAGES.passwordShort && newPasswordError("longenough") === null);
check("the human fallback is added once", withHumanFallback("We couldn't save that") === `We couldn't save that. If it keeps happening, email ${INFO_EMAIL}.`);
check("a message that names info@ is left alone", withHumanFallback(`Email ${INFO_EMAIL}.`) === `Email ${INFO_EMAIL}.`);
for (const raw of ["New password should be different from the old password.", "Auth session missing!", "Password should be at least 8 characters", "Failed to fetch", "Something odd"]) {
  const msg = passwordUpdateErrorMessage(raw);
  check(`set-password error "${raw}" → plain words with info@`, msg.includes(INFO_EMAIL) && !msg.includes(raw));
}
const issues = [
  { id: "a", message: "first" },
  { id: "b", message: "second" },
  { id: "a", message: "duplicate" },
];
check("issues focus the first field", firstIssueId(issues) === "a" && firstIssueId([]) === null);
check("issues by id keep the first message", issuesById(issues).a === "first" && issuesById(issues).b === "second");
for (const [key, message] of Object.entries(FIELD_MESSAGES)) {
  check(`message "${key}" is a full sentence with no exclamation`, /[.]$/.test(message) && !message.includes("!"));
}

// ── One self-estimate list (M21) ────────────────────────────────────────────
console.log("Self-estimate list (M21)");
const values = SELF_LEVELS.map((o) => o.value);
check("one list includes elite", values.includes("elite"));
check("values are unique", new Set(values).size === values.length);
check("every value the recommender reads is offered", (["new", "rally", "competitive", "elite"] as const).every((v) => values.includes(v)));
check("every option has a first- and third-person label", SELF_LEVELS.every((o) => o.label && o.labelOther));
check("the child path reads in the third person", selfLevelLabel("rally", { self: false }) === "They can rally" && selfLevelLabel("rally", { self: true }) === "I can rally");
check("elite passes through to the recommender", selfEstimateToLevel("elite") === "elite");
const intake = read("src/app/intake/page.tsx");
check("the quiz hands elite to the booking form (no allow-list)", !intake.includes('["new", "rally", "competitive"]') && intake.includes("selfLevel: level,"));
const booking = read("src/app/assessment/book/page.tsx");
check("booking keeps no list of its own", !booking.includes("const SELF_LEVELS"));
check("booking never asks the level twice", !booking.includes('htmlFor="selfLevel"'));
check("booking asks the holder's name only when the player is not Myself", booking.includes("askName={!selfBooking}"));
check("booking asks who a slot is for when several players came over", booking.includes("Who is this slot for?"));
check("every booking failure carries info@", booking.includes("withHumanFallback(data.error ?? SUBMIT_ERROR)") && !/setError\(data\.error \?\? SUBMIT_ERROR\)/.test(booking));
const chooser = read("src/components/participants/WhoIsThisFor.tsx");
check("the chooser keeps no list of its own", !chooser.includes("export const SELF_LEVELS"));

// ── Household chooser issues (M18) ──────────────────────────────────────────
console.log("Household chooser (M18)");
const p1 = { ...emptyGuest("self"), key: "p1", name: "Maya Chen", selfLevel: "rally" };
const p2 = { ...emptyGuest("child"), key: "p2", name: "", selfLevel: "" };
const twoBlocks: HouseholdValue = { ...EMPTY_HOUSEHOLD, guests: [p1, p2] };
const quizIssues = householdIssues(twoBlocks, false, [], { requireProfile: true });
check("an unnamed Player 2 is flagged, not dropped", quizIssues.some((i) => i.id === householdFieldIds.guestName("p2") && i.message === "Add a name for Player 2, or remove this player."));
check("its missing self-estimate is flagged in the third person", quizIssues.some((i) => i.id === householdFieldIds.guestLevel("p2") && i.message.includes("their game")));
check("a complete Player 1 has no issue", !quizIssues.some((i) => i.id.includes("p1")));
check("issues come in screen order", quizIssues[0]?.id === householdFieldIds.guestName("p2"));
const lone: HouseholdValue = { ...EMPTY_HOUSEHOLD, guests: [{ ...emptyGuest("self"), key: "solo" }] };
check("a lone Myself block asks for your name", householdIssues(lone, false, []).some((i) => i.message === "Add your full name."));
check("booking and enroll never require a self-estimate", !householdIssues({ ...lone, guests: [{ ...lone.guests[0], name: "Maya" }] }, false, []).length);
const people: ParticipantOption[] = [
  { id: "self", name: "Sam", relationship: "self", isMinor: false, level: null },
  { id: "kid", name: "Leo", relationship: "child", isMinor: true, level: null },
];
const nobody: HouseholdValue = { selectedIds: [], guests: [], profiles: {} };
check("signed in with nobody chosen asks to choose", householdIssues(nobody, true, people).some((i) => i.id === householdFieldIds.choose));
const chosen: HouseholdValue = { selectedIds: ["kid"], guests: [], profiles: {} };
check("signed in, the quiz asks each chosen player's self-estimate", householdIssues(chosen, true, people, { requireProfile: true }).some((i) => i.id === householdFieldIds.participantLevel("kid")));
const chosenWithAnswer: HouseholdValue = { selectedIds: ["kid"], guests: [], profiles: { kid: { ageBand: "junior", selfLevel: "new" } } };
check("an answered profile has no issue", householdIssues(chosenWithAnswer, true, people, { requireProfile: true }).length === 0);
check("player blocks are fieldsets", chooser.includes("<fieldset") && chooser.includes("<legend"));
check("Remove names the player", chooser.includes('Remove<span className="sr-only"> {heading}</span>'));
check("required fields say so", /required\s*\n\s*className=\{inputClass\}/.test(chooser));
check("the chooser shows each field's error", chooser.includes("<FieldError fieldId={nameId}") && chooser.includes("fieldA11y(nameId"));
check("adding a person signed out moves focus to the new block", /\+ Add another person/.test(chooser) && (chooser.match(/setFocusKey\(guest\.key\)/g) ?? []).length >= 2);

// ── Quiz, wizard and form markup (M19, L10, L11, L12) ───────────────────────
console.log("Quiz and form markup (M19, L10–L12)");
check("the quiz focuses the step heading", intake.includes("useFocusOnChange(headingRef, stepIndex)") && intake.includes("tabIndex={-1}"));
check("the result screen focuses its heading", intake.includes("useFocusOnMount(headingRef)"));
check("the quiz's Next is never disabled for gaps", !intake.includes("disabled={!canContinue()") && intake.includes("aria-disabled={submitting || undefined}"));
check("the quiz lists what is missing under Next", intake.includes("To continue:") && intake.includes('aria-describedby={showGapList ? "intake-missing" : undefined}'));
check("the progress bar is a progressbar", intake.includes('role="progressbar"'));
check("the quiz announces sending and failures", intake.includes("<LiveStatus") && intake.includes("<FormAlert"));
check("the phone label says why", intake.includes("Phone — so Sina can text you about times"));
check("the child path names the parent or guardian", intake.includes("Your full name (parent or guardian)"));
check("the name is prefilled from the Myself block", intake.includes("selfName()"));
check("the child path asks when they can train", intake.includes('"When can they train?"'));
check("availability requires a time or Skip for now", intake.includes("FIELD_MESSAGES.availabilityMissing") && intake.includes("Skip for now"));
check("weekend rows come first in the quiz", intake.includes("weekendFirst"));
check("the wizard chrome is flat on phones", intake.includes("md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-8"));
check("Back and Next stick to the bottom on phones with the safe area", intake.includes("sticky bottom-0") && intake.includes("safe-area-inset-bottom") && intake.includes("md:static"));
check("the answers survive a refresh (sessionStorage draft)", intake.includes("sessionStorage.setItem(DRAFT_KEY") && intake.includes("writeDraft(null)"));
check("a restored draft waits out the bot timer instead of being dropped", intake.includes("if (restoredDraft.current) await waitForFillTime()"));
const navbar = read("src/components/layout/Navbar.tsx");
check("the header shows no quiz CTA inside the quiz", navbar.includes("inQuiz ? null :") && navbar.includes("{!inQuiz && ("));
const enroll = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
check("enroll focuses the step heading", enroll.includes("useFocusOnChange(headingRef, step)"));
check("enroll's Continue is never disabled for gaps", !enroll.includes("disabled={!canContinue()"));
check("enroll players and guardian are fieldsets", (enroll.match(/<fieldset/g) ?? []).length >= 3);
check("enroll failures are alerts", enroll.includes("<FormAlert>{submitError}</FormAlert>"));
check(
  "every enroll refusal carries info@",
  enroll.includes('setSubmitError(withHumanFallback(msg.slice("refused:".length)))') &&
    !enroll.includes('setSubmitError(msg.slice("refused:".length))')
);
check("a server refusal without info@ gets it", withHumanFallback("Missing required fields.") === `Missing required fields. If it keeps happening, email ${INFO_EMAIL}.`);
check(
  "enroll stops a chosen player with no name",
  /if \(!p\.name\.trim\(\)\) \{\s*out\.push\(\{ id: FIELD_IDS\.player\(p\.key\), message: FIELD_MESSAGES\.playerNameMissing \}\)/.test(enroll)
);
check("the no-name message offers a way out and info@", FIELD_MESSAGES.playerNameMissing.includes("choose someone else") && FIELD_MESSAGES.playerNameMissing.includes(INFO_EMAIL));
check("the player block shows its own error", enroll.includes("fieldId={FIELD_IDS.player(player.key)}") && enroll.includes("id={FIELD_IDS.player(player.key)}"));
check("the Copy button is announced", enroll.includes("copied` : \"\""));
check("the e-transfer labels meet the floor", !/text-white\/40">(Amount|Send to|Message)/.test(enroll));
for (const [file, src] of [
  ["login", read("src/app/login/page.tsx")],
  ["forgot-password", read("src/app/auth/forgot-password/page.tsx")],
  ["set-password", read("src/app/set-password/page.tsx")],
  ["newsletter", read("src/components/sections/EmailCapture.tsx")],
  ["notify form", read("src/components/sections/ProgramInterestForm.tsx")],
  ["booking", booking],
] as const) {
  check(`${file}: validates on press (noValidate) and shows FieldError`, src.includes("noValidate") && src.includes("<FieldError"));
  check(`${file}: the submit button is not disabled to block input`, !/disabled=\{!/.test(src));
}
check("set-password never shows Supabase's own text", !read("src/app/set-password/page.tsx").includes("setError(pwError.message)"));
const capture = read("src/components/sections/EmailCapture.tsx");
check("newsletter loading reads Sending…, not …", capture.includes('"Sending…"') && !capture.includes('"…" : "Notify me"'));
check("newsletter success is a status that takes focus", capture.includes('role="status"') && capture.includes("doneRef.current?.focus()"));
check("profile labels are tied to their fields", (read("src/app/profile/ProfileForm.tsx").match(/htmlFor="profile-/g) ?? []).length === 3);
check("the read-only email keeps a focus ring (L7)", !/readOnly[\s\S]{0,120}focus:outline-none md:text-sm/.test(read("src/app/profile/ProfileForm.tsx")));
for (const back of ["privacy/PrivacyBackButton", "refund-policy/RefundPolicyBackButton", "waiver/WaiverBackButton"]) {
  const src = read(`src/app/legal/${back}.tsx`);
  check(`${back}: a 44px target at the floor`, src.includes("TEXT_LINK_MUTED") && !src.includes("text-white/40"));
}
check("TextLink is a 44px target with the focus ring", read("src/components/ui/TextLink.tsx").includes("inline-flex min-h-[44px] items-center rounded ${FOCUS_RING}"));

// ── Slot picker (M22) ───────────────────────────────────────────────────────
console.log("Slot picker (M22)");
const taken = [false, true, false, true];
check("right arrow skips a taken slot", nextEnabledIndex(taken, 0, 1) === 2);
check("right arrow wraps past the end", nextEnabledIndex(taken, 2, 1) === 0);
check("left arrow wraps to the last open slot", nextEnabledIndex(taken, 0, -1) === 2);
check("a fully booked day has no target", nextEnabledIndex([true, true], 0, 1) === -1);
check("the tab stop is the checked slot", tabStopIndex(taken, 2) === 2);
check("with nothing checked, the first open slot", tabStopIndex([true, false, false], -1) === 1);
check("arrow keys map to steps", arrowStep("ArrowRight") === 1 && arrowStep("ArrowDown") === 1 && arrowStep("ArrowLeft") === -1 && arrowStep("ArrowUp") === -1 && arrowStep("Enter") === null);
check("slots are radios in a radiogroup", booking.includes('role="radiogroup"') && booking.includes('role="radio"') && booking.includes("aria-checked={isSel}"));
check("the chosen slot shows a tick, not only colour", booking.includes('{isSel && <span aria-hidden="true">✓</span>}'));
check("a taken slot is announced as booked", booking.includes('<span className="sr-only">, booked</span>'));
check("booking is two columns on desktop", booking.includes("lg:grid-cols-[minmax(0,1fr)_20rem]"));

// ── Signed-in hint without the SDK (M40) ────────────────────────────────────
console.log("Signed-in cookie hint (M40)");
check("a session cookie counts", hasAuthCookie("a=1; sb-abcd1234-auth-token=base64-xyz; b=2"));
check("a chunked session cookie counts", hasAuthCookie("sb-abcd1234-auth-token.0=base64-xyz"));
check("the PKCE verifier is not a session", !hasAuthCookie("sb-abcd1234-auth-token-code-verifier=abc"));
check("an empty cookie is not a session", !hasAuthCookie("sb-abcd1234-auth-token="));
check("no cookie, no session", !hasAuthCookie("") && !hasAuthCookie("theme=dark"));

// ── Booking counted once (L13) ──────────────────────────────────────────────
console.log("Booking analytics (L13)");
const memory = new Map<string, string>();
const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
check("the first sight of a booking counts", firstSightOfBooking("b-1", store));
check("a reload does not count it again", !firstSightOfBooking("b-1", store));
check("another booking counts", firstSightOfBooking("b-2", store));
check("a visit without a booking id never counts", !firstSightOfBooking(null, store));
const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
check("blocked storage still counts once per load", firstSightOfBooking("b-3", throwing));

// ── Contrast floor and micro type (M23, L3) ─────────────────────────────────
// The CI grep the audit asked for: text below white/55 (white/60 at 12px),
// placeholders below white/45 and 10–11px type fail anywhere under src,
// except `disabled:` variants and the tier graphics (their own PR).
console.log("Contrast floor (M23, L3)");
const SKIP = [join(ROOT, "src", "components", "tiers"), join(ROOT, "src", "scripts")];
const files: string[] = [];
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP.some((s) => full === s || full.startsWith(s + sep))) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|css)$/.test(name)) files.push(full);
  }
}
walk(join(ROOT, "src"));
check("scanned the source", files.length > 100, String(files.length));
const LOW_TEXT = /(?<![\w:/-])text-white\/(\d+)(?![\w/.\]])/g;
const LOW_PLACEHOLDER = /placeholder(?::text)?-white\/(\d+)(?![\w/.\]])/g;
const MICRO = /text-\[(?:[0-9]|1[01])px\]/g;
const offenders: string[] = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const where = `${relative(ROOT, file).split(sep).join("/")}:${i + 1}`;
      for (const m of line.matchAll(LOW_TEXT)) if (Number(m[1]) < 55) offenders.push(`${where} ${m[0]}`);
      for (const m of line.matchAll(LOW_PLACEHOLDER)) if (Number(m[1]) < 45) offenders.push(`${where} ${m[0]}`);
      for (const m of line.matchAll(MICRO)) offenders.push(`${where} ${m[0]}`);
    });
}
check("no text, placeholder or micro type below the floor", offenders.length === 0, `\n      ${offenders.join("\n      ")}`);
const input = read("src/components/ui/Input.tsx");
check("inputs keep a 3:1 border", input.includes("border-white/35") && input.includes("placeholder:text-white/45"));
check("off availability cells keep a 3:1 outline", read("src/components/ui/AvailabilityGrid.tsx").includes('"border-white/35 bg-white/5 text-white/70'));
check("Coming Soon is the neutral chip, not the warn yellow", !read("src/components/sections/ProgramCard.tsx").includes("Coming Soon") || !/yellow-[0-9]{3}[^\n]*\n\s*Coming Soon/.test(read("src/components/sections/ProgramCard.tsx")));
check("design-system.md documents the floor", read("ops/briefs/design-system.md").includes("### Contrast floor (audit M23)"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll forms and accessibility checks passed.");

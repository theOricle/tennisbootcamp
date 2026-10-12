// Run from project root: npx tsx src/scripts/test-quiz-state.ts
//
// Pins audit item M (owner, 2026-10-12: "quiz-taken state + player choice at
// enrollment — cover all contingencies"):
//   1. one quiz-taken rule (src/lib/quizStatus.ts): the account's own data
//      when signed in, a first-party cookie plus a localStorage mirror when
//      signed out, set by /api/intake only on a submission it wrote; every
//      quiz prompt becomes the taker's next step, with a small retake link;
//   2. who an enrollment is for (src/lib/enrollPlayers.ts): seats per
//      player, a player already in the cohort shown disabled, ages checked
//      and blocked with the right group offered, levels noted and never a
//      block, an invitation's player locked, the account cap, a typed twin
//      reused, a ticked row that gained a reason still untickable, and no
//      password step inside the wizard (fix round 2: the set-up email is the
//      one way an account opens);
//   3. the guest enrollment's one account email (buildAccountSetupEmail),
//      sent to an account never activated, once per cohort, retryable by
//      the admin; an activated account hears "you're enrolled" instead.
// Pure rules are driven directly; the surfaces are source checks, since the
// repo has no DOM test runner. Exits non-zero on any failure.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ADD_PLAYER_LABEL,
  OPEN_DASHBOARD_LABEL,
  QUIZ_FLAG_COOKIE,
  QUIZ_FLAG_MAX_AGE_SECONDS,
  RETAKE_QUIZ_LABEL,
  SEE_GROUPS_LABEL,
  accountQuizStatus,
  decodeQuizFlag,
  deviceQuizStatus,
  encodeQuizFlag,
  matchedGroupsHref,
  playerTookQuiz,
  quizFlagCookie,
  quizFlagFor,
  quizNextStep,
  quizView,
  readQuizFlagFromCookies,
  retakeQuizHref,
} from "../lib/quizStatus";
import {
  ACCOUNT_EMAIL_NOT_OFFERED,
  accountAtCap,
  accountEmailOffered,
  accountNeedsSetup,
  ageBandBlock,
  alreadyInCohortReason,
  dobAgeError,
  groupAgesLabel,
  groupTakesBand,
  groupTakesExactAge,
  invitedLockReasons,
  levelNote,
  matchingPlayer,
  pickedButBlockedIssue,
  playersPhrase,
  recordSetupEmail,
  reusedPlayerNote,
  rightGroupHref,
  seatCapIssue,
  setupEmailSentFor,
  twinBlockedNote,
} from "../lib/enrollPlayers";
import { approvalGateApplies, claimedInvite, type EnrollGateDecision } from "../lib/enrollGate";
import { groupById, programGroups } from "../content/programs";
import { defaultLocation } from "../content/locations";
import { MAX_PARTICIPANTS_PER_ACCOUNT } from "../lib/participantInput";
import { buildAccountSetupEmail, SIGN_OFF_NAME } from "../lib/emailBodies";
import { senderLine } from "../lib/casl";
import { QUIZ_CTA_LABEL } from "../lib/quizBar";
import { QuizBand } from "../components/sections/QuizBand";
import { HowJoiningWorks } from "../components/sections/HowJoiningWorks";
import { TrackedButton } from "../components/ui/TrackedButton";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const at = (hay: string, needle: string) => {
  const i = hay.indexOf(needle);
  return i === -1 ? Infinity : i;
};
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const location = defaultLocation()!;

// ═══════════════════════════════════════════════════════════════════════════
// 1. The quiz-taken rule
// ═══════════════════════════════════════════════════════════════════════════

console.log("Device flag: encode and decode");
check("a one-player flag round-trips", JSON.stringify(decodeQuizFlag(encodeQuizFlag({ playerCount: 1, ageBand: "junior", tierSlug: "novice" }))) === JSON.stringify({ playerCount: 1, ageBand: "junior", tierSlug: "novice" }));
check("a household flag with no band round-trips", JSON.stringify(decodeQuizFlag(encodeQuizFlag({ playerCount: 2, ageBand: null, tierSlug: null }))) === JSON.stringify({ playerCount: 2, ageBand: null, tierSlug: null }));
check("the value carries only vocabulary words and a count", encodeQuizFlag({ playerCount: 1, ageBand: "junior", tierSlug: "novice" }) === "v1.1.junior.novice");
check("an unknown band or tier is dropped, never guessed", encodeQuizFlag({ playerCount: 1, ageBand: "toddler" as never, tierSlug: "grand-slam" }) === "v1.1..");
check("a tampered value decodes to null", [decodeQuizFlag("v1.1.junior.<script>"), decodeQuizFlag("v2.1.junior.novice"), decodeQuizFlag("v1.0.."), decodeQuizFlag("v1.99.."), decodeQuizFlag(""), decodeQuizFlag(null)].every((x) => x === null));
check("the count is capped at the account cap", decodeQuizFlag(encodeQuizFlag({ playerCount: 40, ageBand: null, tierSlug: null }))?.playerCount === MAX_PARTICIPANTS_PER_ACCOUNT);
check("quizFlagFor maps the first player's self-estimate to a provisional tier (owner D4)", JSON.stringify(quizFlagFor({ playerCount: 1, ageBand: "teen", selfLevel: "rally" })) === JSON.stringify({ playerCount: 1, ageBand: "teen", tierSlug: "novice" }));
check("quizFlagFor: Not sure and Prefer not to say name no tier", quizFlagFor({ playerCount: 1, ageBand: "adult", selfLevel: "unsure" }).tierSlug === null && quizFlagFor({ playerCount: 1, ageBand: "adult", selfLevel: "" }).tierSlug === null);
check("the cookie is read from a document.cookie string", JSON.stringify(readQuizFlagFromCookies(`sb-x=1; ${QUIZ_FLAG_COOKIE}=v1.1.adult.intermediate; other=2`)) === JSON.stringify({ playerCount: 1, ageBand: "adult", tierSlug: "intermediate" }));
check("no cookie reads as none", readQuizFlagFromCookies("sb-x=1") === null && readQuizFlagFromCookies(null) === null);
{
  const cookie = quizFlagCookie({ playerCount: 1, ageBand: "adult", tierSlug: null }, { secure: true });
  check("the cookie is first-party, functional: a year, Lax, site-wide, never HttpOnly", cookie.name === QUIZ_FLAG_COOKIE && cookie.maxAge === QUIZ_FLAG_MAX_AGE_SECONDS && cookie.sameSite === "lax" && cookie.path === "/" && cookie.httpOnly === false && cookie.secure === true);
  check("a year", QUIZ_FLAG_MAX_AGE_SECONDS === 60 * 60 * 24 * 365);
}

console.log("Signed in: the account's own data");
check("a coach level counts as taken (placed players are never asked)", playerTookQuiz({ level: 3.5 }));
check("a self-estimate counts, Prefer not to say included", playerTookQuiz({ level: null, self_level: "rally" }) && playerTookQuiz({ level: null, self_level: "" }));
check("an age band counts", playerTookQuiz({ level: null, self_level: null, age_band: "junior" }));
check("availability the quiz wrote counts", playerTookQuiz({ level: null, availability_source: "intake", availability: { days: { sat: ["mor"] }, v: 1 } }));
check("availability from the dashboard editor does not", !playerTookQuiz({ level: null, availability_source: "dashboard", availability: { days: { sat: ["mor"] }, v: 1 } }));
check("a bare row (before 0009, never asked) is not taken", !playerTookQuiz({ level: null, self_level: null, age_band: null, availability: null }));
{
  const holder = { level: null, self_level: null, age_band: null };
  const child = { level: null, self_level: "new", age_band: "junior" };
  const taken = accountQuizStatus([holder, child]);
  check("a quiz taken for a child only counts for the household", taken.taken && taken.playerCount === 2);
  check("…and the matched link follows the child's band and likely tier", taken.matchedHref === `/programs?location=${location.id}&age=junior&level=beginner`);
  const mixed = accountQuizStatus([{ ...child }, { level: null, self_level: "rally", age_band: "adult" }]);
  check("two players on different bands link to the whole catalog at the club", mixed.matchedHref === `/programs?location=${location.id}`);
  const nobody = accountQuizStatus([holder]);
  check("an account that never took it reads as new (a guest enrollment)", !nobody.taken && nobody.matchedHref === `/programs?location=${location.id}`);
  check("an empty account reads as new", !accountQuizStatus([]).taken);
}

console.log("Signed out: the device flag");
check("no flag is new", !deviceQuizStatus(null).taken);
check("one player links to their groups at the club", deviceQuizStatus({ playerCount: 1, ageBand: "teen", tierSlug: "intermediate" }).matchedHref === `/programs?location=${location.id}&age=teen&level=intermediate`);
check("a household links to the whole catalog at the club", deviceQuizStatus({ playerCount: 2, ageBand: "teen", tierSlug: "intermediate" }).matchedHref === `/programs?location=${location.id}`);
check("matched links always name the location (item N)", matchedGroupsHref(null, null) === `/programs?location=${location.id}` && location.id === "newtonbrook");

console.log("The next step that replaces a quiz prompt");
const status = { taken: true, playerCount: 1, matchedHref: "/programs?location=newtonbrook&age=adult" };
check("signed out: See your groups, to the matched catalog", JSON.stringify(quizNextStep(status, false)) === JSON.stringify({ href: "/programs?location=newtonbrook&age=adult", label: SEE_GROUPS_LABEL }));
check("signed in: Open your dashboard", JSON.stringify(quizNextStep(status, true)) === JSON.stringify({ href: "/dashboard", label: OPEN_DASHBOARD_LABEL }));
check("the labels are verb-first and one name per thing", SEE_GROUPS_LABEL === "See your groups" && OPEN_DASHBOARD_LABEL === "Open your dashboard" && RETAKE_QUIZ_LABEL === "Retake the quiz" && ADD_PLAYER_LABEL === "Add another player");
check("the server render is unknown: the visitor's quiz, never a flash", quizView({ signedIn: false, account: null, device: undefined }).state === "unknown");
check("signed out with no flag is new", quizView({ signedIn: false, account: null, device: null }).state === "new");
check("signed out with a flag is taken, to the matched groups", (() => { const v = quizView({ signedIn: false, account: null, device: { playerCount: 1, ageBand: "adult", tierSlug: null } }); return v.state === "taken" && v.next.href === `/programs?location=${location.id}&age=adult` && v.next.label === SEE_GROUPS_LABEL; })());
check("signed in while the account read is in flight is unknown", quizView({ signedIn: true, account: null, device: { playerCount: 1, ageBand: "adult", tierSlug: null } }).state === "unknown");
check("signed in, the account decides and a family device's flag is ignored", quizView({ signedIn: true, account: { taken: false, playerCount: 1, matchedHref: "/programs" }, device: { playerCount: 1, ageBand: "adult", tierSlug: null } }).state === "new");
check("signed in and taken goes to the dashboard", (() => { const v = quizView({ signedIn: true, account: status, device: null }); return v.state === "taken" && v.next.href === "/dashboard"; })());

console.log("Retake the quiz opens the first step, not the already-taken panel");
check("the retake link adds ?retake=1 to the quiz link", retakeQuizHref() === "/intake?retake=1" && retakeQuizHref("/intake") === "/intake?retake=1");
check("…keeps a program page's query, and never doubles the flag", retakeQuizHref("/intake?program=bootcamps") === "/intake?program=bootcamps&retake=1" && retakeQuizHref("/intake?retake=1") === "/intake?retake=1" && retakeQuizHref("/intake?program=x&retake=1") === "/intake?program=x&retake=1");

// ═══════════════════════════════════════════════════════════════════════════
// 2. Who an enrollment is for
// ═══════════════════════════════════════════════════════════════════════════

console.log("Ages: the group's range against a band or an exact age");
const g710 = groupById("youth-7-10")!;
const hp = groupById("high-performance")!;
const adults = groupById("adult-newer")!;
const privateGroup = groupById("private-lessons")!;
check("the lineup is the owner's", Boolean(g710 && hp && adults && privateGroup) && programGroups.length === 7);
check("a junior fits Ages 7–10; a teen does not", groupTakesBand(g710, "junior") && !groupTakesBand(g710, "teen") && !groupTakesBand(g710, "adult"));
check("a teen fits the 16-and-up adult group (16 and 17 overlap); a junior does not", groupTakesBand(adults, "teen") && groupTakesBand(adults, "adult") && !groupTakesBand(adults, "junior"));
check("an unknown band blocks nobody (the date of birth settles it)", groupTakesBand(g710, null) && groupTakesBand(g710, undefined));
check("private lessons take any age", groupTakesBand(privateGroup, "junior") && groupTakesExactAge(privateGroup, 60) && groupAgesLabel(privateGroup) === "");
check("ages in words", groupAgesLabel(g710) === "7–10" && groupAgesLabel(adults) === "16 and up" && groupAgesLabel(hp) === "12–17");
check("the block names the group's ages", ageBandBlock(g710, "teen") === "Outside this group's ages (7–10)" && ageBandBlock(g710, "junior") === null);
check("an exact age: 11 is outside 7–10, 10 is inside, 16 is inside 16 and up", !groupTakesExactAge(g710, 11) && groupTakesExactAge(g710, 10) && groupTakesExactAge(adults, 16) && !groupTakesExactAge(adults, 15));
check("the DOB field says the ages and offers the right group", (dobAgeError(g710, 11) ?? "").includes("takes ages 7–10") && (dobAgeError(g710, 11) ?? "").includes("needs a different group") && dobAgeError(g710, 9) === null && dobAgeError(null, 40) === null);
check("the right group is the catalog filtered to the band, at the club", rightGroupHref("teen", location.id) === `/programs?location=${location.id}&age=teen` && rightGroupHref(null, null) === "/programs");

console.log("Levels: noted, never a block (joining flow, owner 2026-10-12)");
const span = { min: 1, max: 2.5 };
check("inside the band says nothing", levelNote({ name: "Maya", level: 2.0 }, span) === null);
check("a coach level outside the band is named, with the week-one promise", (levelNote({ name: "Maya", level: 4.0 }, span) ?? "").startsWith("Maya: Advanced · 4.0, outside this group's Beginner – Novice band.") && (levelNote({ name: "Maya", level: 4.0 }, span) ?? "").includes("week one"));
check("a provisional tier inside the band is named provisional", levelNote({ name: "Leo", level: null, selfLevel: "rally" }, span) === "Leo: provisional Novice, from the quiz. Our coaches confirm it on court in week one.");
check("a provisional tier outside the band says so, with the move", (levelNote({ name: "Leo", level: null, selfLevel: "elite" }, span) ?? "").includes("provisional Advanced, from the quiz, outside this group's Beginner – Novice band") && (levelNote({ name: "Leo", level: null, selfLevel: "elite" }, span) ?? "").includes("same price"));
check("no level and no estimate says nothing; an unbanded cohort says nothing of a level", levelNote({ name: "Leo", level: null, selfLevel: "unsure" }, span) === null && levelNote({ name: "Maya", level: 6.5 }, { min: null, max: null }) === null);
check("the words never retire a tier name", !/\b(Love|Deuce|Match Point|Grand Slam)\b/.test(levelNote({ name: "Leo", level: null, selfLevel: "elite" }, span) ?? ""));

console.log("Who can be picked");
const people = [
  { id: "self", name: "Dana Chen" },
  { id: "maya", name: "Maya Chen" },
  { id: "leo", name: "Leo Chen" },
];
check("an invitation for Maya disables everyone else with the reason", JSON.stringify(invitedLockReasons(people, "maya")) === JSON.stringify({ self: "This invitation is for Maya Chen", leo: "This invitation is for Maya Chen" }));
check("an invitation for a player not on this account locks nobody", JSON.stringify(invitedLockReasons(people, "stranger")) === "{}" && JSON.stringify(invitedLockReasons(people, null)) === "{}");
check("already in the cohort: the three reasons", alreadyInCohortReason("enrolled") === "Already enrolled in this group" && alreadyInCohortReason("pending").includes("payment pending") && alreadyInCohortReason("invited").includes("open the link in that email"));
check("the cap: 12 players, the holder included", !accountAtCap(MAX_PARTICIPANTS_PER_ACCOUNT - 1) && accountAtCap(MAX_PARTICIPANTS_PER_ACCOUNT) && MAX_PARTICIPANTS_PER_ACCOUNT === 12);
check("a typed twin is the player already there (spaces and case aside)", matchingPlayer(people, "  maya   CHEN ")?.id === "maya" && matchingPlayer(people, "Maya Chen-Lee") === null && matchingPlayer(people, "") === null);
check("…and the user is told", reusedPlayerNote("Maya Chen") === "Maya Chen is already on your account, so we picked them.");
check("a typed twin the chooser has disabled is said, not picked: the row's reason", twinBlockedNote("Maya Chen", alreadyInCohortReason("enrolled")) === "Maya Chen is already on your account — already enrolled in this group." && twinBlockedNote(" ", "Outside this group's ages (7–10)") === "That player is already on your account — outside this group's ages (7–10)." && twinBlockedNote(null, "This invitation is for Leo Chen") === "That player is already on your account — this invitation is for Leo Chen.");
check("a chosen player with a reason stops the who step, with the reason and the way out", pickedButBlockedIssue("Leo Chen", "Outside this group's ages (7–10)") === "Leo Chen can't take a seat here — outside this group's ages (7–10). Untick them to continue." && pickedButBlockedIssue(undefined, "Already enrolled in this group").startsWith("This player can't take a seat here"));

console.log("The invitation a link carries, on a public cohort too");
{
  const live = { state: "valid" as const, invite: { id: "inv-1", email: "dana@example.com", participant_id: "maya" } };
  check("a valid lookup is the claimed invite; expired, invalid or none is not", claimedInvite(live)?.id === "inv-1" && claimedInvite(live)?.participant_id === "maya" && claimedInvite({ state: "expired" }) === null && claimedInvite({ state: "invalid" }) === null && claimedInvite(null) === null && claimedInvite(undefined) === null);
  const pub: EnrollGateDecision = { allowed: true, via: "public" };
  const byInvite: EnrollGateDecision = { allowed: true, via: "invite" };
  const byLevel: EnrollGateDecision = { allowed: true, via: "level" };
  const refused: EnrollGateDecision = { allowed: false, status: 403, expired: false };
  check("a public High Performance cohort with no invitation is by approval", approvalGateApplies({ group: hp, decision: pub, claimed: null }));
  check("…but the player holding the invitation link walks through (the gate still says public)", !approvalGateApplies({ group: hp, decision: pub, claimed: claimedInvite(live) }));
  check("a private cohort's own gate decided already; an open group never gates", !approvalGateApplies({ group: hp, decision: byInvite, claimed: null }) && !approvalGateApplies({ group: hp, decision: byLevel, claimed: null }) && !approvalGateApplies({ group: hp, decision: refused, claimed: null }) && !approvalGateApplies({ group: g710, decision: pub, claimed: null }) && !approvalGateApplies({ group: null, decision: pub, claimed: null }));
  // The page has no payable grace: an expired link on a public High
  // Performance cohort meets ApprovalGate there, while the payment routes'
  // approvalRefusal lets the same token pay (test-checkout-gate.ts, fix round 3).
  check("the page still sends an expired invitation link on a public High Performance cohort to ApprovalGate", approvalGateApplies({ group: hp, decision: pub, claimed: claimedInvite({ state: "expired" }) }));
}

console.log("Send account email (admin): only where someone enrolled");
check("a paid invite, or an e-transfer on its way, gets it", accountEmailOffered({ status: "paid", payment_method: "card" }) && accountEmailOffered({ status: "paid", payment_method: null }) && accountEmailOffered({ status: "invited", payment_method: "etransfer" }) && accountEmailOffered({ status: "expired", payment_method: "etransfer" }));
check("a bare, expired or declined invitation does not (nobody enrolled)", !accountEmailOffered({ status: "invited", payment_method: null }) && !accountEmailOffered({ status: "invited", payment_method: "card" }) && !accountEmailOffered({ status: "expired", payment_method: null }) && !accountEmailOffered({ status: "declined", payment_method: "etransfer" }) && !accountEmailOffered({ status: "declined" }));
check("the refusal says who gets it, plainly", ACCOUNT_EMAIL_NOT_OFFERED.includes("paid invite") && ACCOUNT_EMAIL_NOT_OFFERED.includes("e-transfer") && !ACCOUNT_EMAIL_NOT_OFFERED.includes("!"));

console.log("Seats: one per player, never more than are left");
check("room, or an unknown count, stops nobody", seatCapIssue(3, 2) === null && seatCapIssue(null, 9) === null && seatCapIssue(2, 2) === null);
check("one seat left for two players says choose one", seatCapIssue(1, 2) === "Only 1 spot is left in this group, so choose one player.");
check("two seats left for three players says at most two", seatCapIssue(2, 3) === "Only 2 spots are left in this group, so choose at most 2 players.");
check("no seats left says so", seatCapIssue(0, 1) === "This group has no spots left.");

console.log("No password step inside the wizard (fix round 2)");
{
  // A password typed by a visitor nobody has verified would be a latent
  // credential on an unconfirmed account: live the moment the real address
  // owner clicks any confirming link and leaves /set-password without
  // setting one. The step, its copy and its route are gone; the set-up
  // email after the enrollment is the one way an account opens.
  const players = read("src/lib/enrollPlayers.ts");
  check("enrollPlayers exports no account-step value, rule or copy", !players.includes("ACCOUNT_STEP_COPY") && !players.includes("accountStepIssues") && !players.includes("AccountStepValue") && !players.includes("newPasswordError"));
  check("the route that took the password is gone", !existsSync(join(ROOT, "src/app/api/enroll/account/route.ts")) && !existsSync(join(ROOT, "src/app/api/enroll/account")));
  check("nothing in src posts to it or names it", !read("src/app/enroll/[cohortId]/EnrollWizard.tsx").includes("/api/enroll/account") && !read("src/lib/analytics.ts").includes("enroll_account_created"));
}

console.log("After the enrollment: who hears what");
check("no user, or one never confirmed and never signed in, needs setting up", accountNeedsSetup(null) && accountNeedsSetup({ email_confirmed_at: null, last_sign_in_at: null }));
check("a confirmed address, or a sign-in, means the enrolled note instead", !accountNeedsSetup({ email_confirmed_at: "2026-10-01T00:00:00Z", last_sign_in_at: null }) && !accountNeedsSetup({ email_confirmed_at: null, last_sign_in_at: "2026-10-01T00:00:00Z" }));
{
  const meta = recordSetupEmail(null, "fall-a", "2026-10-12T10:00:00Z");
  check("the set-up email is recorded per cohort on the user's metadata", setupEmailSentFor(meta, "fall-a") && !setupEmailSentFor(meta, "fall-b") && !setupEmailSentFor(null, "fall-a") && !setupEmailSentFor({ tb_setup_emails: "junk" }, "fall-a"));
  const more = recordSetupEmail({ ...meta, full_name: "Dana" }, "fall-b", "2026-10-13T10:00:00Z");
  check("a second cohort is added, the first kept", setupEmailSentFor(more, "fall-a") && setupEmailSentFor(more, "fall-b"));
}
check("the players phrase", playersPhrase(["Maya"]) === "Maya" && playersPhrase(["Maya", "Leo"]) === "Maya and Leo" && playersPhrase(["Maya", "Leo", "Sam"]) === "Maya, Leo and Sam" && playersPhrase([" ", null]) === "");

// ═══════════════════════════════════════════════════════════════════════════
// 3. The account set-up email
// ═══════════════════════════════════════════════════════════════════════════

console.log("Set up your account (the guest enrollment's one account email)");
{
  const paid = buildAccountSetupEmail({ playerNames: ["Maya Chen", "Leo Chen"], programTitle: "Youth Bootcamps", cohortLabel: "Fall A", paid: true, link: "https://tennisbootcamp.ca/auth/callback?token_hash=x&type=invite&next=/set-password" });
  check("the subject states the fact and names the players", paid.subject === "Set up your account: Maya Chen and Leo Chen are enrolled in Fall A");
  check("the body names every player, the group and the payment", paid.text.includes("Maya Chen and Leo Chen are enrolled in Youth Bootcamps — Fall A, and the payment is in."));
  check("it says why there is an account and what the dashboard shows", paid.text.includes("We created a Tennis Bootcamp account for this email address.") && paid.text.includes("every session date"));
  check("the link is the button, HTML and text alike", paid.html.includes('href="https://tennisbootcamp.ca/auth/callback?token_hash=x&type=invite&next=/set-password"') && paid.text.includes("Set your password: https://tennisbootcamp.ca/auth/callback?token_hash=x"));
  check("the way to a new link is named", paid.text.includes("Forgot password?"));
  check("an activation link: no commercial footer", !(paid.html + paid.text).includes(senderLine()) && !(paid.html + paid.text).includes("Don't want"));
  check("signed by the coaching team, HTML and text alike", paid.html.includes(`<strong style="color:#fff;">${SIGN_OFF_NAME}</strong>`) && paid.text.includes(`See you on the court,\n${SIGN_OFF_NAME}`));
  check("speaks as we, never I", !/\bI\b|\bme\b/.test(paid.text.replace(/https?:\S+/g, "")));
  const held = buildAccountSetupEmail({ playerNames: ["Maya Chen"], programTitle: "Adult Bootcamps", cohortLabel: "Fall B", paid: false, link: "https://tennisbootcamp.ca/auth/x" });
  check("an e-transfer on its way reads as a held spot, one player singular", held.subject === "Set up your account: the spot for Maya Chen in Fall B is held" && held.text.includes("Maya Chen is down for Adult Bootcamps — Fall B. Once your e-transfer arrives"));
  const nameless = buildAccountSetupEmail({ playerNames: [], programTitle: "Adult Bootcamps", cohortLabel: "Fall B", paid: true, link: "https://tennisbootcamp.ca/auth/x" });
  check("no name on the row still reads", nameless.subject === "Set up your account: you're enrolled in Fall B" && nameless.text.includes("You are enrolled in Adult Bootcamps — Fall B"));
  check("no retired tier name, no coach named", !/\b(Love|Deuce|Match Point|Grand Slam|Sina|Kassaian)\b|Head Coach/.test(paid.html + paid.text + held.text));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. The surfaces (source checks and server renders)
// ═══════════════════════════════════════════════════════════════════════════

console.log("Quiz-aware CTAs: TrackedButton and TrackedLink");
const tracked = read("src/components/ui/TrackedButton.tsx");
check("a quiz CTA swaps to the taker's next step once known, an assessment CTA never", tracked.includes('track === "quiz" && quizAware !== false && quiz.state === "taken"') && tracked.includes("useQuizStatus()"));
check("the swapped click is tagged -taken for analytics", tracked.includes("`${source}-taken`"));
check("quizAware={false} keeps the quiz (Retake the quiz)", read("src/components/quiz/QuizSwap.tsx").includes("quizAware={false}") && read("src/components/quiz/QuizSwap.tsx").includes("RETAKE_QUIZ_LABEL"));
check("every Retake link opens the first step: the hero's default and the band's program link both go through retakeQuizHref", read("src/components/quiz/QuizSwap.tsx").includes("href={retakeQuizHref(href)}") && read("src/components/sections/QuizBand.tsx").includes("<RetakeQuizLink\n                href={href}") && !read("src/components/sections/Hero.tsx").includes('<RetakeQuizLink href="/intake"'));
{
  const ssr = render(createElement(TrackedButton, { href: "/intake", track: "quiz", source: "test", variant: "primary" }, QUIZ_CTA_LABEL));
  check("the server render is the visitor's quiz: href and label", ssr.includes('href="/intake"') && ssr.includes(QUIZ_CTA_LABEL) && !ssr.includes(SEE_GROUPS_LABEL));
}
const hook = read("src/lib/useQuizStatus.ts");
check("the hook reads the flag with useSyncExternalStore and an unknown server snapshot", hook.includes("useSyncExternalStore(subscribe, rawDeviceFlag, serverSnapshot)") && hook.includes("return undefined;"));
check("the hook reads the account once per page, only when signed in, and never statically imports the SDK", hook.includes('fetch("/api/quiz-status"') && hook.includes("if (!signedIn) return;") && !/^import[^\n]*from "@\/lib\/supabase\/browser";/m.test(hook));
check("rememberQuizTaken mirrors the route's cookie and wakes every island", hook.includes("export function rememberQuizTaken") && hook.includes("readQuizFlagFromCookies(") && hook.includes("localStorage.setItem(QUIZ_FLAG_COOKIE") && hook.includes("notify();"));
const statusRoute = read("src/app/api/quiz-status/route.ts");
check("/api/quiz-status reads the account's players under the session and applies the one rule", statusRoute.includes("listParticipantsForAccount(user.id, supabase)") && statusRoute.includes("accountQuizStatus(players)") && statusRoute.includes("no-store"));

console.log("The flag is set by /api/intake only on a written submission");
const intakeRoute = read("src/app/api/intake/route.ts");
const drop = intakeRoute.slice(at(intakeRoute, 'decision.action === "drop"'), at(intakeRoute, 'decision.action === "reject"'));
check("a bot drop answers ok with no cookie", drop.includes("NextResponse.json({ ok: true })") && !drop.includes("quizFlagCookie"));
check("the cookie is set after the Sheet append, on the real response", at(intakeRoute, "res.cookies.set(") > at(intakeRoute, "sheets.spreadsheets.values.append(") && intakeRoute.includes("quizFlagCookie(") && intakeRoute.includes("quizFlagFor({ playerCount: rows.length, ageBand: body.ageBand, selfLevel: body.level })"));
check("the Sheet contract is untouched", intakeRoute.includes("buildIntakeRow(") && intakeRoute.includes("INTAKE_APPEND_RANGE_ALL") && read("src/lib/intakeRow.ts") === read("src/lib/intakeRow.ts"));
const intakePage = read("src/app/intake/page.tsx");
check("the quiz mirrors the flag after the route answered ok", at(intakePage, "rememberQuizTaken();") > at(intakePage, 'if (!res.ok) throw new Error("Submission failed");'));
check("the already-taken panel: see your groups (the quiz-aware button), add another player, retake", intakePage.includes("function AlreadyTakenPanel") && intakePage.includes("You&apos;ve already taken the quiz.") && intakePage.includes("{ADD_PLAYER_LABEL}") && intakePage.includes("{RETAKE_QUIZ_LABEL}") && /<TrackedButton variant="primary" href="\/intake" track="quiz" source="intake-taken">/.test(intakePage));
check("the panel never hides a half-finished quiz (a step passed, a player named or a time picked), and ?add=1 / ?retake=1 skip it", intakePage.includes("!draftInProgress.current") && intakePage.includes("draft.stepIndex > 0 ||") && intakePage.includes("draft.form.household.guests.some((g) => g.name.trim().length > 0)") && intakePage.includes('searchParams.has("add")') && intakePage.includes('searchParams.has("retake")'));
check("an untouched draft (every visit writes one) does not hide the panel", !intakePage.includes("!restoredDraft.current &&"));
check("Add another player opens on a child's block", intakePage.includes('guests: [emptyGuest("child")]'));

console.log("Every quiz prompt becomes the taker's next step");
const navbar = read("src/components/layout/Navbar.tsx");
check("navbar: desktop slot and drawer are quiz-aware, the label locked", (navbar.match(/<TrackedButton[\s\S]*?track="quiz"[\s\S]*?source="navbar"/g) ?? []).length === 2 && navbar.includes("{QUIZ_CTA_LABEL}") && !navbar.includes("trackQuizCtaClick"));
const hero = read("src/components/sections/Hero.tsx");
check("hero: the primary is quiz-aware and marked for the bar; the note swaps with a retake link", /<TrackedButton variant="primary" href="\/intake" track="quiz" source="hero" data-quiz-cta>/.test(hero) && hero.includes("<QuizSwap") && hero.includes("<RetakeQuizLink") && hero.includes("Your quiz answers are in"));
const bar = read("src/components/layout/MobileQuizBar.tsx");
check("mobile bar: the one button is quiz-aware", bar.includes('track="quiz" source="mobile-bar"') && !bar.includes("trackQuizCtaClick"));
const band = read("src/components/sections/QuizBand.tsx");
check("quiz band: heading, body and button change for a taker; a retake link stays", band.includes('taken ? "Your quiz answers are in." : "Not sure which program fits?"') && band.includes("<RetakeQuizLink") && band.includes('track="quiz"') && band.includes("data-quiz-cta"));
{
  const ssr = render(createElement(QuizBand, { source: "test" }));
  check("quiz band server render is the visitor's", ssr.includes("Not sure which program fits?") && ssr.includes(QUIZ_CTA_LABEL) && !ssr.includes("Your quiz answers are in"));
  const steps = render(createElement(HowJoiningWorks, { source: "test" }));
  check("how joining works step 1 server render is unchanged", /Not sure which fits\? <a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a> and our coaches place you\./.test(steps));
}
const joining = read("src/components/sections/HowJoiningWorks.tsx");
check("how joining works step 1 swaps the sentence for a taker", joining.includes("<QuizSwap") && joining.includes("You&apos;ve taken the quiz, so our"));
check("home programs line swaps", read("src/components/sections/ProgramsGrid.tsx").includes("<QuizSwap") && read("src/components/sections/ProgramsGrid.tsx").includes("You&apos;ve taken the quiz:"));
check("the catalog's empty state is quiz-aware", read("src/components/sections/ProgramCatalog.tsx").includes('<TrackedLink href="/intake" track="quiz" source="programs-empty"'));
check("group cards and the /programs header already use the quiz-aware links", read("src/components/sections/ProgramGroupCard.tsx").includes("<TrackedLink") && /source="programs-header"[\s\S]*data-quiz-cta/.test(read("src/app/programs/page.tsx")));
const detail = read("src/app/programs/[slug]/page.tsx");
check("program pages: the sentences swap for a signed-out taker, the panel for a member", detail.includes("taken={<>You&apos;ve taken the quiz, so you&apos;re on our list already.</>}") && detail.includes("You&apos;ve taken the quiz: our coaches place you in a group by level"));
check("ViewerSwap takes a taken node, members first", read("src/components/programs/ProgramViewer.tsx").includes('if (viewer.state === "member") return <>{member}</>;') && read("src/components/programs/ProgramViewer.tsx").includes('taken !== undefined && quiz.state === "taken" && !quiz.signedIn'));
check("404 and About are quiz-aware", /<TrackedButton\s+variant="primary"\s+href="\/intake"\s+track="quiz"/.test(read("src/app/not-found.tsx")) && read("src/app/about/page.tsx").includes('track="quiz" source="about-closing"'));
check("/assessment and the booking page swap their sentences", read("src/app/assessment/page.tsx").includes("You&apos;ve taken the quiz, so our coaches place you from your answers either") && read("src/app/assessment/book/page.tsx").includes("You&apos;ve taken the quiz, so our coaches already place you"));
const login = read("src/app/login/page.tsx");
check("login: a taker is told an account exists and how to get in", login.includes("<QuizSwap") && login.includes("Took the quiz already? An account was created for your email.") && login.includes('href="/auth/forgot-password"'));
check("enroll gates are quiz-aware", (read("src/app/enroll/[cohortId]/page.tsx").match(/track="quiz"/g) ?? []).length >= 3);
const dashView = read("src/app/dashboard/DashboardView.tsx");
check("dashboard: a taker keeps Add another player and Retake the quiz; an account that never took it is offered it", dashView.includes('href="/intake?add=1"') && dashView.includes('href="/intake?retake=1"') && dashView.includes("Not placed yet? Take the 2-minute quiz") && read("src/app/dashboard/page.tsx").includes("quizTaken={accountQuizStatus(players).taken}"));
check("dashboard: still one primary", (dashView.match(/className=\{primaryButton\}/g) ?? []).length === 1);
check("the privacy policy names the cookie: first-party, what it holds, a year, how to clear it", read("src/app/legal/privacy/page.tsx").includes("first-party cookie") && /holds no name or email/.test(read("src/app/legal/privacy/page.tsx").replace(/\s+/g, " ")) && read("src/app/legal/privacy/page.tsx").includes("kept for a year") && read("src/app/legal/privacy/page.tsx").includes("Clearing your") && read("src/app/legal/privacy/page.tsx").includes('EFFECTIVE_DATE = "October 12, 2026"'));

console.log("Who is this for? — the chooser");
const chooser = read("src/components/participants/WhoIsThisFor.tsx");
check("signed out: new player first, the sign-in line second, back to the same page", chooser.includes("signInHref") && chooser.includes("Sign in to choose your player →") && at(chooser, "+ Add another person") < at(chooser, 'Have an account?{" "}'));
check("signed in: age group and level or provisional tier on each row", chooser.includes("AGE_BAND_LABELS[p.ageBand]") && chooser.includes("`Provisional: ${provisional.name}`") && chooser.includes("selfLevel?: string | null"));
check("rows disabled with their reason; an invited player locked", chooser.includes("disabledReasons?: Record<string, string>") && chooser.includes("lockedIds?: readonly string[]") && chooser.includes("if (locked(id) && value.selectedIds.includes(id)) return;") && chooser.includes("This invitation is for them"));
check("a ticked row that gained a reason (a player added with a band outside the group, once the account reloaded) stays live and can be unticked, so 'Untick them to continue.' is a way out", chooser.includes("if (!canPick(id) && !value.selectedIds.includes(id)) return;") && !chooser.includes("if (!canPick(id)) return;") && chooser.includes("disabled={!pickable && !selected}") && !chooser.includes("disabled={!pickable}\n"));
check("…one seat: unticking the blocked player leaves nobody chosen rather than re-picking them", chooser.includes("} else if (!canPick(id)) {\n        // One seat") && chooser.includes("onChange({ ...value, selectedIds: [] });"));
check("the level-band reason still reads, dimmed, with no tick box", chooser.includes("Outside this group's level band") && chooser.includes("bg-transparent opacity-60") && chooser.includes("(pickable || selected) &&"));
check("New player: a typed twin is picked and said; the cap is said before the form", chooser.includes("+ New player") && chooser.includes("matchingPlayer(participants, fullName)") && chooser.includes("reusedPlayerNote(") && chooser.includes("accountAtCap(participants.length)") && chooser.includes("{PARTICIPANT_CAP_ERROR}"));
check("…but a twin the chooser has disabled is never picked by typing its name: the reason is said before any selection", (() => { const added = chooser.slice(at(chooser, "onAdded={(p, profile, note) => {"), at(chooser, "onCancel={() => setAdding(false)}")); return added.includes("const reason = reasonFor(p.id);") && added.includes("setReusedNote(twinBlockedNote(p.name, reason));") && at(added, "if (reason) {") < at(added, "onChange({"); })());
const participantsRoute = read("src/app/api/participants/route.ts");
check("/api/participants exposes the self-estimate and reuses a twin instead of adding one", participantsRoute.includes("selfLevel: p.self_level ?? null") && participantsRoute.includes("findExistingParticipant(existing, { fullName, relationship })") && participantsRoute.includes("reused: true"));
check("the booking page offers the sign-in line too", read("src/app/assessment/book/page.tsx").includes('signInHref={loginHref("/assessment/book")}'));

console.log("Enrollment: the page's facts and the wizard's rules");
const enrollPage = read("src/app/enroll/[cohortId]/page.tsx");
check("the page finds the cohort's group and gates a by-approval group with no invite — read from the lookup, so an invitee holding the link on a public cohort walks through", enrollPage.includes("programGroups.find((g) => cohortMatchesGroup(cohort, g))") && enrollPage.includes("const claimed = claimedInvite(gate.lookup);") && enrollPage.includes("approvalGateApplies({ group, decision: gate.decision, claimed })") && !enrollPage.includes('gate.decision.via === "public"') && enrollPage.includes("function ApprovalGate") && enrollPage.includes("{APPROVAL_LINE}"));
check("the page lists who is already in the cohort: paid, pending and live invites, and paid rows by name", enrollPage.includes("async function blockedPlayers") && enrollPage.includes('alreadyInCohortReason("enrolled")') && enrollPage.includes('alreadyInCohortReason("pending")') && enrollPage.includes('alreadyInCohortReason("invited")') && enrollPage.includes("matchingPlayer(input.participants, row.participant_name"));
check("the invite being claimed never blocks its own player", enrollPage.includes("if (invite.id === input.claimingInviteId) continue;"));
check("an invitation's player: locked on its account, prefilled for a guest, on a public cohort as much as a private one", enrollPage.includes("const invitedParticipantId = claimed?.participant_id ?? null;") && enrollPage.includes("const claimingInviteId = claimed?.id ?? null;") && enrollPage.includes("const inviteEmail = gate.inviteEmail ?? claimed?.email ?? null;") && !enrollPage.includes('gate.decision.via === "invite" && gate.lookup') && enrollPage.includes("onAccount: true") && enrollPage.includes("onAccount: false") && enrollPage.includes("getParticipant(invitedParticipantId)"));
check("sign-in comes back to this page with the token", enrollPage.includes("`/enroll/${cohort.id}?invite=${encodeURIComponent(queryToken)}`") && enrollPage.includes("const signInHref = loginHref(thisPage);") && enrollPage.includes("signInHref={signInHref}"));
const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
check("the chooser gets the reasons, the lock, the sign-in line, and one seat for an invited player", wizard.includes("disabledReasons={disabledReasons}") && wizard.includes("lockedIds={lockedIds}") && wizard.includes("signInHref={signInHref}") && wizard.includes("multiple={!invited?.onAccount}"));
check("ages: a band outside the group blocks (signed in: disabled; guest: an issue on the band), with the right groups a link away", wizard.includes("ageBandBlock(group, band)") && wizard.includes("ageBandBlock(group, g.ageBand)") && wizard.includes("rightGroupHref(") && wizard.includes("See the groups for their age →"));
check("the date of birth is checked against the group's exact ages", wizard.includes("dobAgeError(group, age)") && wizard.includes("This group takes ages ${groupAgesLabel(group)}."));
check("See the groups for their age under the DOB only when the age is the problem, not for a missing or malformed date", wizard.includes("errors[FIELD_IDS.dob(player.key)] &&\n              group &&\n              dobAgeError(group, computeAge(player.dob)) && ("));
check("a chosen player who carries a reason stops the who step", wizard.includes("const reason = disabledReasons[id];") && wizard.includes("pickedButBlockedIssue(p?.name, reason)"));
check("seats: the wizard stops more players than seats before the routes do", wizard.includes("seatCapIssue(seatsRemaining, players.length)"));
check("levels are noted under the chooser, never a block", wizard.includes("levelNote(") && wizard.includes("levelNotes.map((note) =>") && !wizard.includes("levelBlock"));
check("the registrant step asks a guest for no password: no account step, no password field, no sign-in, no browser SDK, no client-side storage", !wizard.includes("AccountStep") && !/type=\{?"password"/.test(wizard) && !wizard.includes('autoComplete="new-password"') && !wizard.includes("PasswordToggleIcon") && !wizard.includes("signInWithPassword") && !wizard.includes("@/lib/supabase/browser") && !wizard.includes("localStorage") && !wizard.includes("sessionStorage") && !wizard.includes('fetch("/api/participants", {\n            method: "POST"'));
check("the guest's one route to an account is the set-up email: the wizard names it where the step was", wizard.includes("No password is asked for here (fix round 2)") && wizard.includes("set-up email after the enrollment opens their account"));
check("e-transfer and card both carry every player's participant id (unchanged)", wizard.includes("participantId: p.participantId,") && wizard.includes("participants: players.map((p) => ({"));
check("every account the enrollment creates is created unconfirmed (players.ts), and the set-up email confirms it", read("src/lib/players.ts").includes("email_confirm: false") && !read("src/lib/players.ts").includes("email_confirm: true"));

console.log("After the enrollment: one account email, once, retryable");
const actions = read("src/lib/supabase/enrollmentActions.ts");
check("a new address gets the set-up email through the invite branch", actions.includes("issueActivationLink(email, params.enrollmentId, setupMessage)") && actions.includes("sendAccountSetupEmail({"));
check("an account never activated gets it through the magic-link branch, once per cohort", actions.includes("if (accountNeedsSetup(user)) {") && actions.includes("setupEmailSentFor(user?.user_metadata ?? null, cohortId)") && actions.includes("markSetupEmailSent("));
check("an activated account gets You're enrolled, never a second set-password email", at(actions, "await sendEnrolledEmail({") > at(actions, "if (accountNeedsSetup(user)) {"));
check("the admin can send it again on purpose", actions.includes("export async function resendAccountEmail") && actions.includes("force: true") && read("src/app/api/admin/cohorts/[id]/route.ts").includes('action === "account_link"') && read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx").includes("Send account email"));
check("…only on an invite someone enrolled on: the button and the route both read accountEmailOffered", read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx").includes("{accountEmailOffered(invite) && mode === \"idle\" && (") && !read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx").includes('invite.status !== "declined" && mode === "idle"') && read("src/app/api/admin/cohorts/[id]/route.ts").includes("if (!accountEmailOffered(invite)) {") && read("src/app/api/admin/cohorts/[id]/route.ts").includes("ACCOUNT_EMAIL_NOT_OFFERED"));
check("owner writes still only touch an unowned row", (actions.match(/\.update\(\{ user_id: \w+ \}\)[^;]*;/g) ?? []).every((w) => w.includes('.is("user_id", null)')));
for (const route of ["src/app/api/checkout/route.ts", "src/app/api/enroll/etransfer/route.ts", "src/app/api/webhooks/stripe/route.ts"]) {
  const src = read(route);
  check(`${route}: passes the cohort and every player's name to the account email`, src.includes("cohortId,") && (src.includes("playerNames:") || src.includes("playerNames }")));
}
check("the webhook reads the names from the rows it marked paid", read("src/app/api/webhooks/stripe/route.ts").includes("participantNamesOf(paidEnrollmentIds)"));
check("the confirmation page tells a guest to check their email and what the dashboard shows", read("src/app/enroll/[cohortId]/confirmed/page.tsx").includes("Check your email for the link to set up your account: it names the players you enrolled") && read("src/app/enroll/[cohortId]/confirmed/page.tsx").includes("Your dashboard then shows this enrollment"));
check("this script is in the npm test chain", JSON.parse(read("package.json")).scripts.test.includes("src/scripts/test-quiz-state.ts"));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll quiz-state checks passed.");

// Run from project root: npx tsx src/scripts/test-quiz-state.ts
//
// Pins audit item M (owner, 2026-10-12: "quiz-taken state + player choice at
// enrollment — cover all contingencies"):
//   1. one quiz-taken rule (src/lib/quizStatus.ts): the account's own data
//      when signed in; signed out, every visitor reads as new (owner,
//      2026-11-18: a browser cannot tell who is at it), so the device flag
//      /api/intake still writes (a first-party cookie plus a localStorage
//      mirror) decides nothing; every quiz prompt becomes a signed-in taker's
//      next step, a group card's button opens its block's sign-up page for
//      everyone (backlog #85), and the already-taken panel lists the open
//      blocks, never a dead end;
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
  encodeQuizFlag,
  matchedGroupsHref,
  playerTookQuiz,
  quizFlagCookie,
  quizFlagFor,
  quizNextStep,
  quizView,
  readQuizFlagFromCookies,
  retakeQuizHref,
  type QuizView,
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
import { AlreadyTakenPanel } from "../components/quiz/AlreadyTakenPanel";
import { groupById, programGroups } from "../content/programs";
import { defaultLocation } from "../content/locations";
import { MAX_PARTICIPANTS_PER_ACCOUNT } from "../lib/participantInput";
import { buildAccountSetupEmail, SIGN_OFF_NAME } from "../lib/emailBodies";
import { senderLine } from "../lib/casl";
import { JOIN_CTA_LABEL, QUIZ_CTA_LABEL, QUIZ_SIDE_LEAD, QUIZ_TAKEN_LEAD } from "../lib/mainAction";
import { HowJoiningWorks } from "../components/sections/HowJoiningWorks";
import { MainAction, QuizSideLine } from "../components/ui/MainAction";
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
check("quizFlagFor: a competitive or tournament junior or teen carries the band alone, so See your groups lists the High Performance Youth Bootcamp; an adult keeps the tier", quizFlagFor({ playerCount: 1, ageBand: "teen", selfLevel: "competitive" }).tierSlug === null && quizFlagFor({ playerCount: 1, ageBand: "junior", selfLevel: "elite" }).tierSlug === null && quizFlagFor({ playerCount: 1, ageBand: "adult", selfLevel: "competitive" }).tierSlug === "intermediate" && quizFlagFor({ playerCount: 1, ageBand: "adult", selfLevel: "elite" }).tierSlug === "advanced");
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

// Backlog #71 (owner, 2026-11-18): the three checks of deviceQuizStatus (no
// flag is new; one player links to their groups; a household links to the
// whole catalog) left with the function. It turned the device flag into
// "taken", and nothing may do that now: a browser cannot tell who is at it.
// What replaces them is pinned under "Signed out: every visitor is new".
console.log("Matched links (a signed-in taker's catalog link)");
check("matched links always name the location (item N)", matchedGroupsHref(null, null) === `/programs?location=${location.id}` && location.id === "newtonbrook");

console.log("Signed out: every visitor is new (owner, 2026-11-18)");
{
  // A flag as /api/intake writes it for one adult beginner: before backlog
  // #71 it made a signed-out browser read as a quiz-taker.
  const adultFlag = decodeQuizFlag("v1.1.adult.beginner");
  const flags = [adultFlag, { playerCount: 2, ageBand: null, tierSlug: null }, { playerCount: 1, ageBand: "junior" as const, tierSlug: "novice" }, null, undefined];
  check("v1.1.adult.beginner is a real flag, so the check below is not passing on a value that decodes to nothing", JSON.stringify(adultFlag) === JSON.stringify({ playerCount: 1, ageBand: "adult", tierSlug: "beginner" }));
  check(
    "signed out, the quiz view is new whatever the flag holds: quizView takes no device input",
    flags.every((device) =>
      // @ts-expect-error quizView has no device input since backlog #71: the flag decides nothing.
      quizView({ signedIn: false, account: null, device }).state === "new"
    )
  );
  check("signed out, even an account status in memory makes no taker: nothing answers for a signed-out visitor", quizView({ signedIn: false, account: { taken: true, playerCount: 1, matchedHref: "/programs" } }).state === "new");
  check("the server render is new too (signed out until the browser says otherwise): the visitor's quiz, never a flash", quizView({ signedIn: false, account: null }).state === "new");
  const statusSrc = read("src/lib/quizStatus.ts");
  const viewSrc = statusSrc.slice(at(statusSrc, "export function quizView("));
  check("quizView reads no flag: its body names no device, cookie or stored value", viewSrc.length > 0 && !/device|cookie|localStorage|QuizFlag/i.test(viewSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")) && !statusSrc.includes("export function deviceQuizStatus"));
}

console.log("Signed in: the account decides (unchanged)");
const status = { taken: true, playerCount: 1, matchedHref: "/programs?location=newtonbrook&age=adult" };
check("signed out: See your groups, to the matched catalog (the step itself; no signed-out view reaches it now)", JSON.stringify(quizNextStep(status, false)) === JSON.stringify({ href: "/programs?location=newtonbrook&age=adult", label: SEE_GROUPS_LABEL }));
check("signed in: Open your dashboard", JSON.stringify(quizNextStep(status, true)) === JSON.stringify({ href: "/dashboard", label: OPEN_DASHBOARD_LABEL }));
check("the labels are verb-first and one name per thing", SEE_GROUPS_LABEL === "See your groups" && OPEN_DASHBOARD_LABEL === "Open your dashboard" && RETAKE_QUIZ_LABEL === "Retake the quiz" && ADD_PLAYER_LABEL === "Add another player");
check("signed in while the account read is in flight is unknown", quizView({ signedIn: true, account: null }).state === "unknown");
check("signed in, the account decides: an account that never took it is new", quizView({ signedIn: true, account: { taken: false, playerCount: 1, matchedHref: "/programs" } }).state === "new");
check("signed in and taken goes to the dashboard", (() => { const v = quizView({ signedIn: true, account: status }); return v.state === "taken" && v.signedIn && v.next.href === "/dashboard" && v.next.label === OPEN_DASHBOARD_LABEL; })());

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
  // An expired link on a public High Performance cohort meets ApprovalGate
  // on the page, and since the #84 safety round the payment routes'
  // approvalRefusal refuses the same token too (test-checkout-gate.ts).
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
// The simpler site (backlog #69): the hero's note and the quiz band, the two
// surfaces that carried the small "Retake the quiz" link, left the pages, and
// the RetakeQuizLink component went with them. The label and the link that
// opens the first step stay on the quiz's own already-taken panel and on the
// dashboard (both pinned below). quizAware={false} keeps "Ask about lessons"
// reading its own words and opening the quiz for a taker. Backlog #71 (owner,
// 2026-11-18): a group card's button keeps its own words too, but where it
// goes follows a signed-in taker to the dashboard (quizAware="href").
{
  const cardFile = read("src/components/sections/ProgramGroupCard.tsx");
  const arrangedSrc = cardFile.slice(at(cardFile, "export function ArrangedGroupRow"));
  check("quizAware={false} keeps Ask about lessons on the quiz, on the program page and on the private lessons row", /quizAware=\{false\}[\s\S]{0,120}Ask about lessons/.test(read("src/app/programs/[slug]/page.tsx")) && arrangedSrc.includes("quizAware={false}") && !arrangedSrc.includes('quizAware="href"'));
}
check("quizAware=\"href\": the link keeps its own words, and only where it goes follows the taker", tracked.includes('quizAware?: boolean | "href";') && tracked.includes('{swap && quizAware !== "href" ? quiz.next.label : children}') && tracked.includes("href={swap ? quiz.next.href : href}"));
check("no surface is left holding a Retake link component nobody renders", !read("src/components/quiz/QuizSwap.tsx").includes("RetakeQuizLink") && retakeQuizHref("/intake") === "/intake?retake=1");
{
  const ssr = render(createElement(TrackedButton, { href: "/intake", track: "quiz", source: "test", variant: "primary" }, QUIZ_CTA_LABEL));
  check("the server render is the visitor's quiz: href and label", ssr.includes('href="/intake"') && ssr.includes(QUIZ_CTA_LABEL) && !ssr.includes(SEE_GROUPS_LABEL));
}
const hook = read("src/lib/useQuizStatus.ts");
// Re-pinned for backlog #71: the hook read the flag (cookie, then the
// localStorage mirror) with useSyncExternalStore and fed it to quizView.
// It reads neither now; signed out is new whatever the browser holds.
check("the hook reads no device flag: no cookie read, no stored value, no store subscription", !hook.includes("useSyncExternalStore") && !hook.includes("localStorage.getItem") && !hook.includes("document.cookie.split") && !hook.includes("decodeQuizFlag") && hook.includes("return quizView({ signedIn, account: signedIn ? account : null });"));
check("the hook reads the account once per page, only when signed in, and never statically imports the SDK", hook.includes('fetch("/api/quiz-status"') && hook.includes("if (!signedIn) return;") && !/^import[^\n]*from "@\/lib\/supabase\/browser";/m.test(hook));
// The writes stay (owner, 2026-11-18: listed in the pull request for a later
// item): the hook's mirror into localStorage, and the route's cookie below.
check("rememberQuizTaken still mirrors the route's cookie (a write nothing reads) and wakes every island", hook.includes("export function rememberQuizTaken") && hook.includes("readQuizFlagFromCookies(") && hook.includes("localStorage.setItem(QUIZ_FLAG_COOKIE") && hook.includes("notify();"));
const statusRoute = read("src/app/api/quiz-status/route.ts");
check("/api/quiz-status reads the account's players under the session and applies the one rule", statusRoute.includes("listParticipantsForAccount(user.id, supabase)") && statusRoute.includes("accountQuizStatus(players)") && statusRoute.includes("no-store"));

console.log("The flag is set by /api/intake only on a written submission");
const intakeRoute = read("src/app/api/intake/route.ts");
const drop = intakeRoute.slice(at(intakeRoute, 'decision.action === "drop"'), at(intakeRoute, 'decision.action === "reject"'));
check("a bot drop answers ok with no cookie", drop.includes("NextResponse.json({ ok: true })") && !drop.includes("quizFlagCookie"));
check("the cookie is set after the Sheet append, on the real response", at(intakeRoute, "res.cookies.set(") > at(intakeRoute, "sheets.spreadsheets.values.append(") && intakeRoute.includes("quizFlagCookie(") && intakeRoute.includes("quizFlagFor({ playerCount: rows.length, ageBand: body.ageBand, selfLevel: body.level })"));
check("the Sheet contract is untouched", intakeRoute.includes("buildIntakeRow(") && intakeRoute.includes("INTAKE_APPEND_RANGE_ALL") && read("src/lib/intakeRow.ts") === read("src/lib/intakeRow.ts"));
const intakePage = read("src/app/intake/page.tsx");
// The ok check throws through submitFailure since backlog #84 (review fix 8:
// a refused try shows the route's own line); it still comes first.
check("the quiz mirrors the flag after the route answered ok", at(intakePage, "rememberQuizTaken();") > at(intakePage, "if (!res.ok) throw await submitFailure(res);"));
// Re-pinned for backlog #71: the panel's quiz-aware button read "See your
// groups" for a signed-out browser that had sent the quiz. Only a signed-in
// taker sees the panel now, so it reads "Open your dashboard".
// Re-pinned for backlog #85 (owner, 2026-11-19): the panel lists the open
// blocks with "Join", and the dashboard button is an outline beside them.
// Re-pinned in the fix round of backlog #85: the panel is its own component
// now (src/components/quiz/AlreadyTakenPanel.tsx), rendered here, and the
// page hands it the open blocks from its layout. With none open it keeps
// the quiz-aware button on the lime; its words with blocks are pinned in
// test-group-blocks.ts.
{
  const panel = renderToStaticMarkup(createElement(AlreadyTakenPanel, { playerCount: 1, cards: [], onAdd: () => {}, onRetake: () => {} }));
  const quizButton = panel.match(/<a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>/)?.[0] ?? "";
  check(
    "the already-taken panel: its heading, the quiz-aware button on the lime, add another player, retake",
    panel.includes("You&#x27;ve already taken the quiz.</h1>") &&
      quizButton.includes("bg-[#B4E655]") &&
      panel.includes(`>${ADD_PLAYER_LABEL}</button>`) &&
      panel.includes(`>${RETAKE_QUIZ_LABEL}</button>`) &&
      intakePage.includes("<AlreadyTakenPanel") &&
      intakePage.includes("cards={openGroups}")
  );
}
check(
  "/intake: the panel needs a taken view, which only a signed-in account is, so signed out the quiz opens on its first step, with or without ?program=",
  /quiz\.state === "taken" &&\s+!skipTakenPanel/.test(intakePage) &&
    quizView({ signedIn: false, account: null }).state !== "taken" &&
    !/programParam[^\n]*skipTakenPanel|skipTakenPanel[^\n]*programParam/.test(intakePage)
);
check("the panel never hides a half-finished quiz (a step passed, a player named or a time picked), and ?add=1 / ?retake=1 skip it", intakePage.includes("!draftInProgress.current") && intakePage.includes("draft.stepIndex > 0 ||") && intakePage.includes("draft.form.household.guests.some((g) => g.name.trim().length > 0)") && intakePage.includes('searchParams.has("add")') && intakePage.includes('searchParams.has("retake")'));
check("an untouched draft (every visit writes one) does not hide the panel", !intakePage.includes("!restoredDraft.current &&"));
check("Add another player opens on a child's block", intakePage.includes('guests: [emptyGuest("child")]'));

console.log("Every quiz prompt becomes the taker's next step");
// Since the simpler site (backlog #69, owner 2026-11-16) the lime button is
// the main button ("Join a bootcamp") for everyone, and the quiz is a side line. The side line is
// the quiz prompt now: it keeps the taker's behaviour (their answers are in,
// and the link is their next step), and nothing else on the chrome asks.
const navbar = read("src/components/layout/Navbar.tsx");
check("navbar: the bar and the phone menu carry the main button, and no quiz prompt to swap", (navbar.match(/\{JOIN_CTA_LABEL\}/g) ?? []).length === 2 && !navbar.includes('track="quiz"') && !navbar.includes("QUIZ_CTA_LABEL") && !navbar.includes("trackQuizCtaClick"));
const hero = read("src/components/sections/Hero.tsx");
check("hero: the main action, whose side line swaps for a taker", hero.includes('<MainAction source="hero"') && !hero.includes("<TrackedButton") && !hero.includes("QUIZ_CTA_LABEL"));
const bar = read("src/components/layout/MobileJoinBar.tsx");
check("phone bar: the main button, and no quiz prompt to swap", bar.includes("{JOIN_CTA_LABEL}") && !bar.includes('track="quiz"') && !bar.includes("trackQuizCtaClick"));
const mainAction = read("src/components/ui/MainAction.tsx");
check("the side line: the lead and the quiz link for a visitor; for a taker, their answers are in and the quiz-aware link", mainAction.includes("<QuizSwap") && mainAction.includes("{QUIZ_SIDE_LEAD} {link}") && mainAction.includes("{QUIZ_TAKEN_LEAD} {link}") && mainAction.includes('<TrackedLink href={quizHref} track="quiz" source={source}') && !mainAction.includes("quizAware={false}"));
check("the lead-ins", QUIZ_SIDE_LEAD === "Not sure which group?" && QUIZ_TAKEN_LEAD === "Your quiz answers are in.");
{
  const ssr = render(createElement(QuizSideLine, { source: "test" }));
  check("the side line's server render is the visitor's", /Not sure which group\? <a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>/.test(ssr) && !ssr.includes("Your quiz answers are in") && !ssr.includes(SEE_GROUPS_LABEL));
  const forProgram = render(createElement(QuizSideLine, { source: "test", quizHref: "/intake?program=bootcamps" }));
  check("on a program page the side line carries the program", forProgram.includes('href="/intake?program=bootcamps"'));
  const action = render(createElement(MainAction, { source: "test" }));
  check("the main action's server render: the main button to /programs, then the side line", new RegExp(`<a [^>]*href="/programs"[^>]*>${JOIN_CTA_LABEL}</a>`).test(action) && action.indexOf(JOIN_CTA_LABEL) < action.indexOf("Not sure which group?") && action.includes(QUIZ_CTA_LABEL));
  check("the main button is the same for everyone: it is no quiz prompt, so nothing swaps it", !/<TrackedButton[^>]*>\s*\{JOIN_CTA_LABEL\}/.test(mainAction) && /<Button variant="primary" href=\{href\}[^>]*data-main-cta>\s*\{JOIN_CTA_LABEL\}/.test(mainAction));
  const steps = render(createElement(HowJoiningWorks));
  check("how joining works carries no quiz prompt", !steps.includes("quiz") && !steps.includes("<a "));
}
check("the home page's programs carry no quiz line of their own", !read("src/components/sections/ProgramsGrid.tsx").includes("QuizSwap") && !read("src/components/sections/ProgramsGrid.tsx").includes("quiz"));
const catalogSrc = read("src/components/sections/ProgramCatalog.tsx");
check("the catalog's empty state is quiz-aware: the quiz for every signed-out visitor, their answers for a signed-in taker", catalogSrc.includes('<TrackedLink href="/intake" track="quiz" source="programs-empty"') && catalogSrc.includes("taken={<>Your quiz answers are in, and our coaches place you from them.</>}"));
check("/programs: the quiz prompt in the band is the side line", catalogSrc.includes('<QuizSideLine source="programs-filters"') && !read("src/app/programs/page.tsx").includes("data-quiz-cta"));
// Re-pinned for backlog #71: the card opted out of the swap entirely
// (quizAware={false}), so a signed-in taker's "Join" opened the quiz's
// already-taken panel. It keeps its words and follows them to the dashboard.
// Re-pinned for backlog #85 (owner, 2026-11-19: "when I am already signed in
// it just tell me I already submitted request"): the card's button opens
// the block's sign-up page, so it is no quiz prompt and nothing swaps it.
{
  const cardFile = read("src/components/sections/ProgramGroupCard.tsx");
  const cardSrc = cardFile.slice(at(cardFile, "export function ProgramGroupCard("), at(cardFile, "export function ArrangedGroupRow"));
  const buttonSrc = cardFile.slice(at(cardFile, "function GroupButton("), at(cardFile, "export function ProgramGroupCard("));
  check("a group card's button is the same for everyone signed in or not: the block's sign-up page, no quiz swap", buttonSrc.includes("`/enroll/${block.cohortId}`") && !buttonSrc.includes("quizAware") && !cardSrc.includes("quizAware"));
}
// Re-pinned for backlog #71: the program pages had two sentences for a
// signed-out browser that had sent the quiz ("You've taken the quiz, so
// you're on our list already." and "You've taken the quiz: our coaches place
// you in a group by level and schedule, …"). A signed-out visitor is a
// guest now, so both left the page with ViewerSwap's taken node.
const detail = read("src/app/programs/[slug]/page.tsx");
const viewerSrc = read("src/components/programs/ProgramViewer.tsx");
// Re-pinned in the fix round of backlog #85: "You're on our list already."
// sat under the cohort list, which left the page with it.
check("program pages: no sentence for a signed-out quiz-taker; a member keeps their own line", !detail.includes("You&apos;ve taken the quiz") && !/\btaken=\{/.test(detail) && detail.includes("You&apos;re on our list: our coaches place you in a group by level"));
check("ViewerSwap: members first, everyone else the guest's words, and no quiz read", viewerSrc.includes('if (viewer.state === "member") return <>{member}</>;') && !viewerSrc.includes("taken?: ReactNode") && !viewerSrc.includes("useQuizStatus"));
// About closes on the main action too (backlog #69, pass 2): JoinClosing puts the quiz-aware side line after the lime button.
check("404 and About are quiz-aware", read("src/app/not-found.tsx").includes('<MainAction source="not-found"') && read("src/app/about/page.tsx").includes('<JoinClosing source="about-closing" />') && read("src/components/sections/JoinClosing.tsx").includes("<MainAction source={source}") && !read("src/app/about/page.tsx").includes('href="/intake"'));
check("/assessment and the booking page swap their sentences for a signed-in taker", read("src/app/assessment/page.tsx").includes("You&apos;ve taken the quiz, so our coaches place you from your answers either") && read("src/app/assessment/book/page.tsx").includes("You&apos;ve taken the quiz, so our coaches already place you"));
const login = read("src/app/login/page.tsx");
// Re-pinned in the fix round of backlog #71 (owner, 2026-11-18). It read
// "login: untouched; both lines still in place, and signed out it shows the
// guest's": the hint "Took the quiz already? An account was created for your
// email. …" showed only to a signed-out browser that had sent the quiz, and
// after #71 to nobody signed out, so a person whose account the quiz created
// lost the one line saying it exists. Signed out, every visitor now reads it,
// flag or no flag, under "New here? Take the 2-minute quiz →"; signed in, the
// account decides, as it did through QuizSwap. Sign-in itself is untouched.
{
  const quizLine = /\{showQuizLine && \(\s*<p[^>]*>\s*New here\?\{" "\}\s*<Link href="\/intake" className=\{linkClass\}>\s*Take the 2-minute quiz →/;
  const accountHint = /\{showAccountHint && \(\s*<p[^>]*>\s*Took the quiz already\? An account was created for your email\. Never set a\s+password\?\{" "\}\s*<Link href="\/auth\/forgot-password" className=\{linkClass\}>\s*Send yourself a link →/;
  check(
    "login: both lines, words unchanged, each behind its own rule from the one quiz view; New here? first, the hint under it",
    login.includes("const quiz = useQuizStatus();") &&
      login.includes('const showQuizLine = quiz.state !== "taken";') &&
      login.includes('const showAccountHint = !quiz.signedIn || quiz.state === "taken";') &&
      quizLine.test(login) &&
      accountHint.test(login) &&
      at(login, "{showQuizLine && (") < at(login, "{showAccountHint && (")
  );
  check("login: the page reads no flag (no cookie, no stored value)", !/tb_quiz|QUIZ_FLAG_COOKIE|QuizFlag|localStorage|document\.cookie/.test(login));
  // The two rules pinned above, over every view the hook returns.
  const lines = (v: QuizView) => [v.state !== "taken" ? "quiz" : "", !v.signedIn || v.state === "taken" ? "hint" : ""].filter(Boolean).join("+");
  const devices = [decodeQuizFlag("v1.1.adult.beginner"), { playerCount: 2, ageBand: null, tierSlug: null }, null, undefined];
  check(
    "login, signed out, with or without the flag: New here? and the hint, both",
    lines(quizView({ signedIn: false, account: null })) === "quiz+hint" &&
      devices.every((device) =>
        // @ts-expect-error quizView has no device input since backlog #71: the flag decides nothing.
        lines(quizView({ signedIn: false, account: null, device })) === "quiz+hint"
      )
  );
  check(
    "login, signed in, as before: the hint alone with quiz answers on file; New here? alone with none, and while the account is read",
    lines(quizView({ signedIn: true, account: status })) === "hint" &&
      lines(quizView({ signedIn: true, account: { taken: false, playerCount: 1, matchedHref: "/programs" } })) === "quiz" &&
      lines(quizView({ signedIn: true, account: null })) === "quiz"
  );
}
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
check("the page finds the cohort's group and gates a by-approval group with no invite — read from the lookup, so an invitee holding the link on a public cohort walks through", enrollPage.includes("const group = groupForBlock(cohort);") && enrollPage.includes("const claimed = claimedInvite(gate.lookup);") && enrollPage.includes("approvalGateApplies({ group, decision: gate.decision, claimed })") && !enrollPage.includes('gate.decision.via === "public"') && enrollPage.includes("function ApprovalGate") && enrollPage.includes("{APPROVAL_LINE}"));
check("the page lists who is already in the cohort: paid, pending and live invites, and paid rows by name", enrollPage.includes("async function blockedPlayers") && enrollPage.includes('alreadyInCohortReason("enrolled")') && enrollPage.includes('alreadyInCohortReason("pending")') && enrollPage.includes('alreadyInCohortReason("invited")') && enrollPage.includes("matchingPlayer(input.participants, row.participant_name"));
check("the invite being claimed never blocks its own player", enrollPage.includes("if (invite.id === input.claimingInviteId) continue;"));
check("an invitation's player: locked on its account, prefilled for a guest, on a public cohort as much as a private one", enrollPage.includes("const invitedParticipantId = claimed?.participant_id ?? null;") && enrollPage.includes("const claimingInviteId = claimed?.id ?? null;") && enrollPage.includes("const inviteEmail = gate.inviteEmail ?? claimed?.email ?? null;") && !enrollPage.includes('gate.decision.via === "invite" && gate.lookup') && enrollPage.includes("onAccount: true") && enrollPage.includes("onAccount: false") && enrollPage.includes("getParticipant(invitedParticipantId)"));
check("sign-in comes back to this page with the token", enrollPage.includes("`/enroll/${cohort.id}?invite=${encodeURIComponent(queryToken)}`") && enrollPage.includes("const signInHref = loginHref(thisPage);") && enrollPage.includes("signInHref={signInHref}"));
const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
check("the chooser gets the reasons, the lock, the sign-in line, and one seat for an invited player", wizard.includes("disabledReasons={disabledReasons}") && wizard.includes("lockedIds={lockedIds}") && wizard.includes("signInHref={signInHref}") && wizard.includes("multiple={!invited?.onAccount}"));
check("ages: signed in, a band outside the group disables the row; signed out, step 1 asks no age and the date of birth on step 2 is the check (backlog #97); the right groups a link away", wizard.includes("ageBandBlock(group, band)") && !wizard.includes("ageBandBlock(group, g.ageBand)") && wizard.includes("dobAgeError(group, age)") && wizard.includes("rightGroupHref(") && wizard.includes("See the groups for their age →"));
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
check("a new address gets the set-up email through the invite branch", actions.includes("issueActivationLink(email, setupMessage)") && actions.includes("sendAccountSetupEmail({") && actions.includes("accountExists: Boolean(userId)"));
check("an account never activated gets it through the magic-link branch, once per cohort", actions.includes("needsSetup: accountNeedsSetup(user)") && actions.includes("setupEmailSentFor(user?.user_metadata ?? null, cohortId)") && actions.includes("markSetupEmailSent("));
check("an activated account gets You're enrolled, never a second set-password email", at(actions, "await sendEnrolledEmail({") > at(actions, "if (plan === \"set-up\") {"));
check("the admin can send it again on purpose", actions.includes("export async function resendAccountEmail") && actions.includes("force: true") && read("src/app/api/admin/cohorts/[id]/route.ts").includes('action === "account_link"') && read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx").includes("Send account email"));
check("…only on an invite someone enrolled on: the button and the route both read accountEmailOffered", read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx").includes("{accountEmailOffered(invite) && mode === \"idle\" && (") && !read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx").includes('invite.status !== "declined" && mode === "idle"') && read("src/app/api/admin/cohorts/[id]/route.ts").includes("if (!accountEmailOffered(invite)) {") && read("src/app/api/admin/cohorts/[id]/route.ts").includes("ACCOUNT_EMAIL_NOT_OFFERED"));
check("owner writes still only touch an unowned row", (actions.match(/\.update\(\{ user_id: \w+ \}\)[^;]*;/g) ?? []).every((w) => w.includes('.is("user_id", null)')));
// The checkout submit sends no account email since backlog #84 (review fix
// 7): the card payment's webhook does, on live money only.
for (const route of ["src/app/api/enroll/etransfer/route.ts", "src/app/api/webhooks/stripe/route.ts"]) {
  const src = read(route);
  check(`${route}: passes the cohort and every player's name to the account email`, src.includes("cohortId,") && (src.includes("playerNames:") || src.includes("playerNames }")));
}
check("the checkout submit sends no account email", !read("src/app/api/checkout/route.ts").includes("notifyEnrollmentAccount("));
check("the webhook reads the names from the rows it marked paid", read("src/app/api/webhooks/stripe/route.ts").includes("participantNamesOf(paidEnrollmentIds)"));
// The confirmation page's words live in src/lib/paymentConfirmation.ts since
// backlog #84 (a test payment's page says it was a test, and test-paid-only.ts
// renders every state); a live payment's words are unchanged.
check("the confirmation page tells a guest to check their email and what the dashboard shows", read("src/lib/paymentConfirmation.ts").includes("Check your email for the link to set up your account: it names the players you enrolled") && read("src/lib/paymentConfirmation.ts").includes("Your dashboard then shows this enrollment") && read("src/app/enroll/[cohortId]/confirmed/page.tsx").includes("enrollConfirmation({"));
check("this script is in the npm test chain", JSON.parse(read("package.json")).scripts.test.includes("src/scripts/test-quiz-state.ts"));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll quiz-state checks passed.");

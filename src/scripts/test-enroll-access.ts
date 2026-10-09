// Run from project root: npx tsx src/scripts/test-enroll-access.ts
//
// Pins audit PR B (2026-10-09, "Accounts, auth and enroll access"):
//   H5  an enrollment row belongs to the session's account, else the account
//       for its contact email; unowned rows are linked by exact email; an
//       existing account hears "You're enrolled" with a dashboard link, never
//       a second set-password email; migration 0008 backfills history.
//   M20 /login reads ?error as a code and ?next as a site-relative path only;
//       Supabase's own words never reach the player.
//   M33 a full cohort is a "This group is full" page, not a 404, and the
//       dashboard's "Open for your tier" drops cohorts with no seat left.
//   L21 every /admin page sends a signed-out visitor to /login?next=.
// Exits non-zero on any failure.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AFTER_LOGIN_DEFAULT,
  CALLBACK_ERROR_COPY,
  LOGIN_ERROR_COPY,
  callbackErrorFor,
  callbackNotice,
  loginErrorMessage,
  loginHref,
  safeNextPath,
} from "../lib/authFlow";
import {
  enrollmentNoticeKind,
  enrollmentOwner,
  enrollmentRowsToLink,
} from "../lib/enrollmentLink";
import { buildEnrolledEmail } from "../lib/emailBodies";
import { cohortsWithSeats } from "../lib/seatCount";
import { SITE_URL } from "../lib/siteUrl";

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

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ─── M20 / L21: where a sign-in may land ─────────────────────────────────────

console.log("safeNextPath — one site-relative path, or the dashboard");
{
  check("default is the dashboard", AFTER_LOGIN_DEFAULT, "/dashboard");
  check("a site path passes", safeNextPath("/admin/cohorts/abc"), "/admin/cohorts/abc");
  check("the query survives (an enroll link)", safeNextPath("/enroll/abc?invite=tok"), "/enroll/abc?invite=tok");
  check("padding is trimmed", safeNextPath("  /dashboard "), "/dashboard");
  check("missing → dashboard", safeNextPath(null), "/dashboard");
  check("undefined → dashboard", safeNextPath(undefined), "/dashboard");
  check("blank → dashboard", safeNextPath("   "), "/dashboard");
  check("another origin → dashboard", safeNextPath("https://evil.example/x"), "/dashboard");
  check("protocol-relative //host → dashboard", safeNextPath("//evil.example/x"), "/dashboard");
  check("backslash variant /\\host → dashboard", safeNextPath("/\\evil.example"), "/dashboard");
  check("a scheme → dashboard", safeNextPath("javascript:alert(1)"), "/dashboard");
  check("whitespace inside → dashboard", safeNextPath("/a b"), "/dashboard");
  check("a backslash inside → dashboard", safeNextPath("/a\\b"), "/dashboard");
  check("control character → dashboard", safeNextPath("/a\u0001b"), "/dashboard");
  check("the login page itself → dashboard (no loop)", safeNextPath("/login"), "/dashboard");
  check("login with a query → dashboard", safeNextPath("/login?next=%2Fadmin"), "/dashboard");
  check("login with a hash → dashboard", safeNextPath("/login#x"), "/dashboard");
  check("the auth callback → dashboard (no loop)", safeNextPath("/auth/callback?code=x"), "/dashboard");
  check("a path that merely starts with 'login' passes", safeNextPath("/logins"), "/logins");
}

console.log("loginHref — what a protected page redirects to");
{
  check("remembers the page", loginHref("/admin/cohorts/abc"), "/login?next=%2Fadmin%2Fcohorts%2Fabc");
  check("the default destination needs no parameter", loginHref("/dashboard"), "/login");
  check("nothing to remember", loginHref(undefined), "/login");
  check("an unsafe destination is dropped, not encoded", loginHref("https://evil.example"), "/login");
  check("round-trips through safeNextPath", safeNextPath(decodeURIComponent(loginHref("/admin").split("next=")[1])), "/admin");
}

// ─── M20: the callback's refusal, and the login page's words ─────────────────

console.log("callbackErrorFor — expired is claimed only for a refused token");
{
  check(
    "verifyOtp 403 → link_expired",
    callbackErrorFor({ status: 403, message: "Token has expired or is invalid" }),
    "link_expired"
  );
  check(
    "no status, Supabase's expired wording → link_expired",
    callbackErrorFor({ message: "Email link is invalid or has expired" }),
    "link_expired"
  );
  check("a 5xx → link_failed, never 'expired' for an outage", callbackErrorFor({ status: 500, message: "boom" }), "link_failed");
  check("nothing known → link_failed", callbackErrorFor({}), "link_failed");
}

console.log("callbackNotice — a code in, the page's own copy out");
{
  check("absent → no notice", callbackNotice(null), null);
  check("blank → no notice", callbackNotice("  "), null);
  check("link_expired → its copy", callbackNotice("link_expired"), CALLBACK_ERROR_COPY.link_expired);
  check("link_failed → its copy", callbackNotice("link_failed"), CALLBACK_ERROR_COPY.link_failed);
  const raw = "Token has expired or is invalid";
  const notice = callbackNotice(raw) ?? "";
  check("an unknown value gets the generic line", notice, CALLBACK_ERROR_COPY.link_failed);
  check("…and the raw value is never echoed", notice.includes(raw), false);
  check("expired copy tells the player what to do", CALLBACK_ERROR_COPY.link_expired.includes("Send yourself a new one"), true);
  check("failed copy names the inbox", CALLBACK_ERROR_COPY.link_failed.includes("info@tennisbootcamp.ca"), true);
}

console.log("loginErrorMessage — plain words and the one way out");
{
  check("Invalid login credentials → mismatch copy", loginErrorMessage("Invalid login credentials"), LOGIN_ERROR_COPY.credentials);
  check("mismatch copy points at Forgot password", LOGIN_ERROR_COPY.credentials.includes("Forgot password?"), true);
  check("Email not confirmed → unconfirmed copy", loginErrorMessage("Email not confirmed"), LOGIN_ERROR_COPY.unconfirmed);
  check("rate limit → wait copy", loginErrorMessage("Request rate limit reached"), LOGIN_ERROR_COPY.rateLimited);
  check("fetch failure → network copy", loginErrorMessage("Failed to fetch"), LOGIN_ERROR_COPY.network);
  const raw = "Database error querying schema";
  check("anything else → generic line", loginErrorMessage(raw), LOGIN_ERROR_COPY.generic);
  check("…which never echoes Supabase", loginErrorMessage(raw).includes("Database"), false);
  check("nothing → generic line", loginErrorMessage(null), LOGIN_ERROR_COPY.generic);
  check("generic line names the inbox", LOGIN_ERROR_COPY.generic.includes("info@tennisbootcamp.ca"), true);
  for (const [key, copy] of Object.entries(LOGIN_ERROR_COPY)) {
    check(`${key}: no exclamation mark`, copy.includes("!"), false);
  }
}

// ─── H5: whose row it is ─────────────────────────────────────────────────────

console.log("enrollmentOwner — the session first, then the email's account");
{
  check("signed in → the session's user, even if the email resolves elsewhere", enrollmentOwner("u_session", "u_lookup"), "u_session");
  check("signed out, email has an account → that account", enrollmentOwner(null, "u_lookup"), "u_lookup");
  check("nobody → null until the invite creates one", enrollmentOwner(null, null), null);
  check("blank session id counts as signed out", enrollmentOwner("", undefined), null);
}

console.log("enrollmentRowsToLink — unowned rows for exactly this email");
{
  const rows = [
    { id: "r1", contact_email: "maya@example.com", user_id: null },
    { id: "r2", contact_email: "  MAYA@Example.com ", user_id: null },
    { id: "r3", contact_email: "maya@example.com", user_id: "u_owner" },
    { id: "r4", contact_email: "mayb@example.com", user_id: null },
    { id: "r5", contact_email: null, user_id: null },
  ];
  check("case and padding ignored, owned rows skipped", enrollmentRowsToLink(rows, "Maya@Example.com"), ["r1", "r2"]);
  check("a near-miss address never links", enrollmentRowsToLink(rows, "mayb@example.com"), ["r4"]);
  check(
    "ilike's `_` wildcard is undone: a_b never matches aXb",
    enrollmentRowsToLink([{ id: "x", contact_email: "aXb@example.com", user_id: null }], "a_b@example.com"),
    []
  );
  check("blank email → nothing", enrollmentRowsToLink(rows, "  "), []);
  check("no rows → nothing", enrollmentRowsToLink([], "maya@example.com"), []);
}

console.log("enrollmentNoticeKind — what the address hears");
{
  check("no account yet → the set-password link", enrollmentNoticeKind(false), "set-password");
  check("account exists → 'You're enrolled', never a second set-password", enrollmentNoticeKind(true), "enrolled");
}

console.log("buildEnrolledEmail — the fact and the dashboard, HTML and text alike");
{
  const dashboard = `${SITE_URL}/dashboard`;
  const paidSelf = buildEnrolledEmail({ name: "Maya Chen", programTitle: "Adult Bootcamps", cohortLabel: "Fall A", paid: true });
  check("paid, self: subject states the fact", paidSelf.subject, "You're enrolled: Adult Bootcamps — Fall A");
  check("paid, self: greets by first name (HTML)", paidSelf.html.includes("You're enrolled, Maya."), true);
  check("paid, self: greets by first name (text)", paidSelf.text.includes("You're enrolled, Maya."), true);
  check("paid: says paid and recorded on the account", paidSelf.text.includes("is paid and recorded on your Tennis Bootcamp account"), true);

  const paidChild = buildEnrolledEmail({ name: "Maya Chen", participantName: "Leo Chen", programTitle: "Youth Programs", cohortLabel: "Fall B", paid: true });
  check("paid, child: subject names the player", paidChild.subject, "Leo is enrolled: Youth Programs — Fall B");
  check("paid, child: headline names the player", paidChild.html.includes("Leo is enrolled."), true);

  const pendingSelf = buildEnrolledEmail({ name: "Maya Chen", programTitle: "Adult Bootcamps", cohortLabel: "Fall A", paid: false });
  check("e-transfer pending, self: subject does not claim enrolled", pendingSelf.subject, "Your spot in Fall A is on your account");
  check("pending: says what makes it final", pendingSelf.text.includes("Once your e-transfer arrives and the coach marks it received, you're in"), true);
  const pendingChild = buildEnrolledEmail({ name: "Maya Chen", participantName: "Leo Chen", programTitle: "Youth Programs", cohortLabel: "Fall B", paid: false });
  check("e-transfer pending, child: subject names the player", pendingChild.subject, "Leo's spot in Fall B is on your account");
  check("pending, child: the player is in once it lands", pendingChild.text.includes("Leo is in"), true);

  for (const [name, email] of [["paid", paidSelf], ["pending", pendingSelf], ["paid child", paidChild]] as const) {
    check(`${name}: dashboard link in HTML`, email.html.includes(dashboard), true);
    check(`${name}: dashboard link in text`, email.text.includes(dashboard), true);
    check(`${name}: never asks to set a password`, /set your password/i.test(email.html + email.text), false);
    check(`${name}: Forgot password hint in HTML`, email.html.includes("Forgot password?"), true);
    check(`${name}: Forgot password hint in text`, email.text.includes("Forgot password?"), true);
    check(`${name}: no exclamation mark`, (email.subject + email.text).includes("!"), false);
    check(`${name}: signed by Sina`, email.text.includes("Sina Kassaian"), true);
  }
}

// ─── M33: seats ──────────────────────────────────────────────────────────────

console.log("cohortsWithSeats — 'Open for your tier' never offers a full group");
{
  const header = ["timestamp", "cohort_id", "status"];
  const snapshot = {
    header,
    rows: [
      ["t", "coh_full", "paid"],
      ["t", "coh_room", "paid"],
      ["t", "coh_room", "pending"],
      ["t", "coh_room", "pending_etransfer"],
      ["t", "coh_pending", "pending"],
      ["t", "coh_pending", "pending_etransfer"],
    ],
  };
  const cohorts = [
    { id: "coh_full", capacityMax: 1 },
    { id: "coh_room", capacityMax: 2 },
    { id: "coh_empty", capacityMax: 4 },
  ];
  check(
    "a cohort whose paid rows reach capacity is dropped; the rest stay",
    cohortsWithSeats(cohorts, snapshot).map((c) => c.id),
    ["coh_room", "coh_empty"]
  );
  check(
    "pending rows never fill a seat (two holds on a one-seat cohort keep it open)",
    cohortsWithSeats([{ id: "coh_pending", capacityMax: 1 }], snapshot).map((c) => c.id),
    ["coh_pending"]
  );
  check("an empty tab keeps every cohort", cohortsWithSeats(cohorts, { header: [], rows: [] }).map((c) => c.id), cohorts.map((c) => c.id));
  check(
    "a tab without the columns (count unknown) keeps every cohort",
    cohortsWithSeats(cohorts, { header: ["x"], rows: [["y"]] }).map((c) => c.id),
    cohorts.map((c) => c.id)
  );
}

// ─── Source pins: the wiring the pure rules depend on ────────────────────────

function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...pagesUnder(rel));
    else if (entry === "page.tsx") out.push(rel);
  }
  return out;
}

console.log("Source: admin pages remember their destination (L21)");
{
  const pages = pagesUnder("src/app/admin");
  check("admin pages found", pages.length > 0, true);
  for (const page of pages) {
    const src = read(page);
    check(`${page}: no bare redirect to /login`, src.includes('redirect("/login")'), false);
    check(`${page}: redirects through adminRefusedRedirect`, src.includes("adminRefusedRedirect("), true);
  }
}

console.log("Source: the callback and the login page share the contract (M20)");
{
  const callback = read("src/app/auth/callback/route.ts");
  check("callback sanitises next", callback.includes("safeNextPath("), true);
  check("callback never forwards Supabase's message", callback.includes("error.message"), false);
  check("callback reports a PKCE failure", /exchangeCodeForSession\(code\);\s*if \(error\)/.test(callback), true);
  const login = read("src/app/login/page.tsx");
  check("login reads the query", login.includes("useSearchParams"), true);
  check("login maps ?error through callbackNotice", login.includes("callbackNotice("), true);
  check("login maps sign-in errors through loginErrorMessage", login.includes("loginErrorMessage("), true);
  check("login follows ?next through safeNextPath", login.includes("safeNextPath("), true);
  check("login never shows authError.message", login.includes("setError(authError.message)"), false);
  const forgot = read("src/app/auth/forgot-password/page.tsx");
  check("forgot-password confirmation is conditional", forgot.includes("If an account exists for"), true);
}

console.log("Source: enrollment rows carry their owner (H5)");
{
  const actions = read("src/lib/supabase/enrollmentActions.ts");
  check("insert writes user_id", actions.includes("user_id: data.userId"), true);
  for (const route of ["src/app/api/checkout/route.ts", "src/app/api/enroll/etransfer/route.ts", "src/app/api/webhooks/stripe/route.ts"]) {
    const src = read(route);
    check(`${route}: resolves the owner`, src.includes("resolveEnrollmentUserId("), true);
    check(`${route}: notifies through notifyEnrollmentAccount`, src.includes("notifyEnrollmentAccount("), true);
    check(`${route}: no direct issueActivationLink`, src.includes("issueActivationLink("), false);
  }
  check("the dashboard still reads by user_id", read("src/app/dashboard/page.tsx").includes('.eq("user_id", userId)'), true);
  check("/profile still reads by user_id", read("src/app/profile/page.tsx").includes('.eq("user_id", userId)'), true);
  const migration = "supabase/migrations/0008_link_enrollments_to_accounts.sql";
  check("migration 0008 exists", existsSync(join(ROOT, migration)), true);
  const sql = read(migration);
  check("migration only touches unowned rows", /where e\.user_id is null/.test(sql), true);
  check("migration matches by lowercased contact_email", sql.includes("lower(btrim(e.contact_email)) = lower(u.email)"), true);
  check("migration carries a -- verify: block", sql.includes("-- verify:"), true);
}

console.log("Source: a full cohort is a page, not a 404 (M33)");
{
  const enroll = read("src/app/enroll/[cohortId]/page.tsx");
  check("no notFound on the seat check", /seatsRemaining <= 0\) notFound\(\)/.test(enroll), false);
  check("renders the full state", enroll.includes("This group is full"), true);
  check("invite gate offers sign-in with the page remembered", enroll.includes("loginHref(`/enroll/${cohort.id}`)"), true);
  const db = read("src/lib/cohortsDb.ts");
  check("getOpenCohortsForLevel filters by seats", db.includes("cohortsWithSeats("), true);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll enroll-access checks passed.");

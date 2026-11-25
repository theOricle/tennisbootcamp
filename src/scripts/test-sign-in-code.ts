// Run from project root: npx tsx src/scripts/test-sign-in-code.ts
//
// Pins backlog #92, the coach's sign-in code (Supabase MFA, TOTP):
//   - the gate's decision table: an admin counts only on a session that has
//     passed the code (AAL2) with a confirmed factor behind it;
//   - every admin page and every admin API goes through that one gate, and
//     the gate reads the level from verified claims, never getSession();
//   - the login page and the emailed-link callback send a session that owes
//     its code to the code page, keeping `next`; no factor, no detour;
//   - the 6-digit field takes exactly six digits;
//   - the set-up and code flows call Supabase in the right order;
//   - migration 0013 changes is_admin()'s body and nothing else.
// Exits non-zero on any failure.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AFTER_SETUP_DEFAULT,
  CODE_COPY,
  CODE_ISSUER,
  CODE_LENGTH,
  CODE_PATH,
  CODE_SETUP_PATH,
  adminGate,
  adminRefusedHref,
  afterSignInPath,
  cleanCode,
  codeErrorKind,
  codeErrorMessage,
  codeHref,
  isCompleteCode,
  needsCodeStep,
  qrImageSrc,
  secretGroups,
  setupHref,
  setupNextPath,
  startSetup,
  submitCode,
  unverifiedFactorIds,
  verifiedTotpFactor,
  type AdminGate,
  type AssuranceLevel,
  type FactorLike,
  type MfaErrorLike,
  type MfaLike,
} from "../lib/signInCode";
import { safeNextPath } from "../lib/authFlow";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown = true) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

const ROOT = process.cwd();
// A Windows checkout may hand files over with CRLF; every pin below reads LF.
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

function filesUnder(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...filesUnder(rel, name));
    else if (entry === name) out.push(rel);
  }
  return out;
}

// ─── The gate's decision table ───────────────────────────────────────────────

console.log("adminGate: the whole table");
{
  const roles: (string | null | undefined)[] = ["admin", "player", "", null, undefined, "Admin", "administrator"];
  const levels: (AssuranceLevel | null | undefined)[] = ["aal1", "aal2", null, undefined];
  let okCount = 0;
  for (const role of roles) {
    for (const aal of levels) {
      for (const hasVerifiedTotp of [true, false]) {
        const expected: AdminGate =
          role !== "admin"
            ? "refused"
            : !hasVerifiedTotp
              ? "needs_setup"
              : aal === "aal2"
                ? "ok"
                : "needs_code";
        if (expected === "ok") okCount++;
        check(
          `role ${JSON.stringify(role)}, level ${JSON.stringify(aal)}, factor ${hasVerifiedTotp} → ${expected}`,
          adminGate({ role, aal, hasVerifiedTotp }),
          expected
        );
      }
    }
  }
  check("exactly one row of the table is ok", okCount, 1);
  check("the one ok row: admin, AAL2, confirmed factor", adminGate({ role: "admin", aal: "aal2", hasVerifiedTotp: true }), "ok");
  check("a password-only admin session is not ok", adminGate({ role: "admin", aal: "aal1", hasVerifiedTotp: true }), "needs_code");
  check("an admin who never set it up is not ok", adminGate({ role: "admin", aal: "aal1", hasVerifiedTotp: false }), "needs_setup");
  check("an AAL2 claim with the factor since removed is not ok", adminGate({ role: "admin", aal: "aal2", hasVerifiedTotp: false }), "needs_setup");
  check("a level that could not be read is not ok", adminGate({ role: "admin", aal: null, hasVerifiedTotp: true }), "needs_code");
  check("a player at AAL2 is still refused", adminGate({ role: "player", aal: "aal2", hasVerifiedTotp: true }), "refused");
}

console.log("adminRefusedHref: where each refusal goes, keeping next");
{
  check("signed out → /login?next=", adminRefusedHref("signed_out", "/admin/players"), "/login?next=%2Fadmin%2Fplayers");
  check("needs code → the code page with next", adminRefusedHref("needs_code", "/admin/players"), "/login/code?next=%2Fadmin%2Fplayers");
  check("needs set-up → the set-up page with next", adminRefusedHref("needs_setup", "/admin/cohorts/abc"), "/login/code/setup?next=%2Fadmin%2Fcohorts%2Fabc");
  check("needs set-up for /admin needs no parameter", adminRefusedHref("needs_setup", "/admin"), "/login/code/setup");
  check("a signed-in non-admin → the dashboard", adminRefusedHref("refused", "/admin/players"), "/dashboard");
  check("ok is never sent round a loop", adminRefusedHref("ok", "/admin"), "/dashboard");
}

// ─── Factors ─────────────────────────────────────────────────────────────────

console.log("Factors: confirmed and left over");
{
  const factors: FactorLike[] = [
    { id: "a", factor_type: "totp", status: "unverified" },
    { id: "b", factor_type: "phone", status: "verified" },
    { id: "c", factor_type: "totp", status: "verified" },
  ];
  check("the confirmed authenticator-app factor", verifiedTotpFactor(factors)?.id, "c");
  check("an unconfirmed one does not count", verifiedTotpFactor([factors[0]]), null);
  check("a confirmed phone factor does not count", verifiedTotpFactor([factors[1]]), null);
  check("none", verifiedTotpFactor([]), null);
  check("missing", verifiedTotpFactor(undefined), null);
  check("leftovers are the unconfirmed ones only", unverifiedFactorIds(factors), ["a"]);
  check("no leftovers", unverifiedFactorIds([factors[2]]), []);
}

// ─── Routing after the first step ────────────────────────────────────────────

console.log("needsCodeStep / afterSignInPath: who owes a code");
{
  check("a factor and a password-only session → owes it", needsCodeStep({ currentLevel: "aal1", nextLevel: "aal2" }), true);
  check("the code already given → no", needsCodeStep({ currentLevel: "aal2", nextLevel: "aal2" }), false);
  check("no factor (a player, a parent) → no", needsCodeStep({ currentLevel: "aal1", nextLevel: "aal1" }), false);
  check("a factor and an unread level → owes it", needsCodeStep({ currentLevel: null, nextLevel: "aal2" }), true);
  check("nothing read → no", needsCodeStep(null), false);
  check("nothing read → no (undefined)", needsCodeStep(undefined), false);

  check("the coach goes to the code page, next kept", afterSignInPath({ currentLevel: "aal1", nextLevel: "aal2" }, "/admin/cohorts/abc"), "/login/code?next=%2Fadmin%2Fcohorts%2Fabc");
  check("the coach with no next: the code page, bare", afterSignInPath({ currentLevel: "aal1", nextLevel: "aal2" }, null), "/login/code");
  check("a player goes straight through, as before", afterSignInPath({ currentLevel: "aal1", nextLevel: "aal1" }, "/enroll/abc?invite=tok"), "/enroll/abc?invite=tok");
  check("a player with no next: the dashboard", afterSignInPath({ currentLevel: "aal1", nextLevel: "aal1" }, null), "/dashboard");
  check("levels unread: straight through (the server gate decides)", afterSignInPath(null, "/admin"), "/admin");
  check("an off-site next never survives the detour", afterSignInPath({ currentLevel: "aal1", nextLevel: "aal2" }, "https://evil.example/x"), "/login/code");
  check("an off-site next never survives straight through", afterSignInPath(null, "//evil.example/x"), "/dashboard");
}

console.log("Paths: the code page and the set-up page");
{
  check("the code page", CODE_PATH, "/login/code");
  check("the set-up page", CODE_SETUP_PATH, "/login/code/setup");
  check("a finished set-up lands on the admin home", AFTER_SETUP_DEFAULT, "/admin");
  check("codeHref keeps a site path", codeHref("/admin/players"), "/login/code?next=%2Fadmin%2Fplayers");
  check("codeHref drops another origin", codeHref("https://evil.example"), "/login/code");
  check("codeHref round-trips through safeNextPath", safeNextPath(decodeURIComponent(codeHref("/admin/art").split("next=")[1])), "/admin/art");
  check("setupNextPath: nothing asked → /admin", setupNextPath(null), "/admin");
  check("setupNextPath: blank → /admin", setupNextPath("  "), "/admin");
  check("setupNextPath: a site path passes", setupNextPath("/admin/cohorts/abc"), "/admin/cohorts/abc");
  check("setupNextPath: another origin → the dashboard", setupNextPath("https://evil.example"), "/dashboard");
  check("setupNextPath: protocol-relative → the dashboard", setupNextPath("//evil.example"), "/dashboard");
  check("setupHref keeps a site path", setupHref("/admin/players"), "/login/code/setup?next=%2Fadmin%2Fplayers");
  check("setupHref: nothing asked → bare", setupHref(null), "/login/code/setup");
  check("neither page can be a next (no loop)", [safeNextPath(CODE_PATH), safeNextPath(CODE_SETUP_PATH), safeNextPath(`${CODE_PATH}?next=%2Fadmin`)], ["/dashboard", "/dashboard", "/dashboard"]);
}

// ─── The 6-digit field ───────────────────────────────────────────────────────

console.log("The field: exactly six digits");
{
  check("the length", CODE_LENGTH, 6);
  check("six digits pass", isCompleteCode("123456"), true);
  check("leading zeros pass", isCompleteCode("000042"), true);
  for (const bad of ["", "12345", "1234567", "12345a", "123 456", " 123456", "123456 ", "12345６", "1e5000", "-12345", "123.45", "abcdef"]) {
    check(`${JSON.stringify(bad)} does not pass`, isCompleteCode(bad), false);
  }
  check("null does not pass", isCompleteCode(null), false);
  check("undefined does not pass", isCompleteCode(undefined), false);

  check("typing keeps digits only", cleanCode("12a3-4 5b6"), "123456");
  check("a pasted code with a space in it", cleanCode("123 456"), "123456");
  check("a pasted code with a dash", cleanCode("123-456"), "123456");
  check("a seventh digit is dropped", cleanCode("1234567"), "123456");
  check("letters leave nothing", cleanCode("abcdef"), "");
  check("nothing leaves nothing", cleanCode(null), "");
  check("what the field keeps is never longer than six", cleanCode("9".repeat(40)).length, 6);
  check("a cleaned full paste is complete", isCompleteCode(cleanCode(" 987 654 ")), true);

  const parts = read("src/components/auth/CodeParts.tsx");
  check("the field cleans what is typed", parts.includes("onChange={(e) => onChange(cleanCode(e.target.value))}"));
  check("the field cleans what is pasted", parts.includes('onChange(cleanCode(e.clipboardData.getData("text")))'));
  check("the field stops at six", parts.includes("maxLength={CODE_LENGTH}"));
  check("a phone opens its number pad", parts.includes('inputMode="numeric"'));
  check("a phone or password manager can offer the code", parts.includes('autoComplete="one-time-code"'));
  check("the field has a real label", parts.includes("<label htmlFor={id}") && parts.includes("{CODE_COPY.fieldLabel}"));
  check("the field shows its problem under it", parts.includes("<FieldError fieldId={id}") && parts.includes("fieldA11y(id, { error })"));
  for (const [file, src] of [
    ["CodeForm", read("src/components/auth/CodeForm.tsx")],
    ["SetupForm", read("src/components/auth/SetupForm.tsx")],
  ] as const) {
    check(`${file}: an incomplete code is stopped before any call`, /if \(!isCompleteCode\(code\)\) \{\s*setFieldError\(CODE_COPY\.incomplete\);/.test(src));
    check(`${file}: validates on press, button never disabled`, src.includes("noValidate") && !/disabled=\{/.test(src));
    check(`${file}: goes on to next after a good code`, src.includes("router.replace(nextPath);"));
    check(`${file}: one lime button`, (src.match(/<CodeSubmit /g) ?? []).length, 1);
  }
}

// ─── The words ───────────────────────────────────────────────────────────────

console.log("Words: plain, and a failure always has a way out");
{
  const all = Object.values(CODE_COPY) as string[];
  check("no exclamation marks", all.some((s) => s.includes("!")), false);
  check("no em or en dashes", all.some((s) => /[—–]/.test(s)), false);
  check("no Supabase vocabulary reaches the page", all.some((s) => /\b(MFA|TOTP|AAL|factor|challenge|token)\b/i.test(s)), false);
  for (const kind of ["rateLimited", "signedOut", "setupStale", "generic"] as const) {
    check(`${kind} offers info@`, codeErrorMessage(kind).includes("info@tennisbootcamp.ca"));
  }
  check("set-up failure offers info@", CODE_COPY.setupFailed.includes("info@tennisbootcamp.ca"));
  check("wrong code: what is wrong and the way out", codeErrorMessage("wrong"), "That code didn't match. Enter the newest code from your app, or email info@tennisbootcamp.ca.");
  check("expired code: what is wrong and the way out", codeErrorMessage("expired"), "That code expired. Enter the newest code from your app, or email info@tennisbootcamp.ca.");
  check("the set-up page has its own wrong-code line", codeErrorMessage("wrong", "setup"), "That code didn't match. If you opened this page again, delete the earlier Tennis Bootcamp entry in your app and scan this code, or email info@tennisbootcamp.ca.");
  check("the code page keeps its own", codeErrorMessage("wrong", "code"), codeErrorMessage("wrong"));
  check("only the wrong-code line differs on the set-up page", (["expired", "rateLimited", "signedOut", "setupStale", "generic"] as const).every((k) => codeErrorMessage(k, "setup") === codeErrorMessage(k)));
  for (const kind of ["wrong", "expired"] as const) {
    check(`${kind} offers info@ on both pages`, codeErrorMessage(kind).includes("info@tennisbootcamp.ca") && codeErrorMessage(kind, "setup").includes("info@tennisbootcamp.ca"));
  }
  check("the set-up form asks for its own line", read("src/components/auth/SetupForm.tsx").includes('<CodeError kind={errorKind} nextPath={nextPath} page="setup" />'));
  {
    const codeForm = read("src/components/auth/CodeForm.tsx");
    check("the code page has a Sign out link under its button", codeForm.indexOf("<CodeSubmit ") < codeForm.indexOf("{CODE_COPY.signOut}") && codeForm.includes('<button type="button" onClick={() => void signOut()} className={TEXT_LINK_MUTED}>'));
    check("it is the header's own sign-out", codeForm.includes('import { signOut } from "@/lib/useAuthState";'));
    check("its label", CODE_COPY.signOut, "Sign out");
  }
  check("the app shows our name beside the code", CODE_ISSUER, "Tennis Bootcamp");
  check("the phone line says the key is the way in", /phone/.test(CODE_COPY.setupKeyLine) && /key/.test(CODE_COPY.setupKeyLine));
}

console.log("codeErrorKind: Supabase's refusals, as ours");
{
  check("a wrong code (code)", codeErrorKind({ code: "mfa_verification_failed", status: 422 }), "wrong");
  check("a wrong code (words)", codeErrorKind({ message: "Invalid TOTP code entered" }), "wrong");
  check("an expired challenge (code)", codeErrorKind({ code: "mfa_challenge_expired" }), "expired");
  check("an expired challenge (words)", codeErrorKind({ message: "MFA Challenge abc has expired, verify against another challenge or create a new challenge." }), "expired");
  check("too many tries (code)", codeErrorKind({ code: "over_request_rate_limit" }), "rateLimited");
  check("too many tries (status)", codeErrorKind({ status: 429 }), "rateLimited");
  check("the set-up's factor is gone", codeErrorKind({ code: "mfa_factor_not_found" }), "setupStale");
  check("the session ran out (code)", codeErrorKind({ code: "session_not_found" }), "signedOut");
  check("the session ran out (words)", codeErrorKind({ message: "Auth session missing!" }), "signedOut");
  check("anything else is generic", codeErrorKind({ message: "upstream connect error", status: 503 }), "generic");
  check("nothing is generic", codeErrorKind(null), "generic");
}

// ─── The set-up key and the QR ───────────────────────────────────────────────

console.log("The key and the QR");
{
  check("the key reads in fours", secretGroups("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"), ["JBSW", "Y3DP", "EHPK", "3PXP", "JBSW", "Y3DP", "EHPK", "3PXP"]);
  check("a short tail keeps its letters", secretGroups("abcdefghij"), ["ABCD", "EFGH", "IJ"]);
  check("joined, the groups are the key", secretGroups("JBSWY3DPEHPK3PXP").join(""), "JBSWY3DPEHPK3PXP");
  check("no key, no groups", secretGroups(null), []);

  // Supabase's real shape: an XML prolog, the generator's comment, then the drawing.
  const real =
    '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg width="150" height="150"\n     xmlns="http://www.w3.org/2000/svg"\n     xmlns:xlink="http://www.w3.org/1999/xlink">\n<rect x="0" y="0" width="150" height="150" style="fill:#ffffff" />\n<rect x="6" y="6" width="6" height="6" style="fill:#000000" />\n</svg>\n';
  const realSrc = qrImageSrc(`data:image/svg+xml;utf-8,${real}`);
  check("Supabase's real format is drawn (prolog + comment + svg)", realSrc?.startsWith("data:image/svg+xml;charset=utf-8,"), true);
  check("and decodes to the same document", decodeURIComponent(realSrc!.split(",").slice(1).join(",")), real.trim());
  check("its # colours cannot cut it short", realSrc?.slice(5).includes("#"), false);
  check("a prolog alone before the svg is drawn", qrImageSrc('data:image/svg+xml;utf-8,<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 1 1"></svg>') !== null, true);
  check("comments alone before the svg are drawn", qrImageSrc("data:image/svg+xml;utf-8,<!-- a --><!-- b -->\n<svg viewBox=\"0 0 1 1\"></svg>") !== null, true);
  check("a prolog with nothing after it is not drawn", qrImageSrc('data:image/svg+xml;utf-8,<?xml version="1.0"?>'), null);
  check("a prolog then another element is not drawn", qrImageSrc('data:image/svg+xml;utf-8,<?xml version="1.0"?><html><svg></svg></html>'), null);
  check("a comment then a script is not drawn", qrImageSrc("data:image/svg+xml;utf-8,<!-- x --><script>1</script><svg></svg>"), null);
  check("a doctype before the svg is not drawn", qrImageSrc('data:image/svg+xml;utf-8,<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'), null);
  check("text before the svg is not drawn", qrImageSrc("data:image/svg+xml;utf-8,hello <svg></svg>"), null);
  check("a tag that only starts with svg is not drawn", qrImageSrc("data:image/svg+xml;utf-8,<svgx></svgx>"), null);
  check("the prolog cannot hide an element", qrImageSrc('data:image/svg+xml;utf-8,<?xml version="1.0"<script>?><svg></svg>'), null);

  // The bare form.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect fill="#000" width="1" height="1"/></svg>';
  const src = qrImageSrc(`data:image/svg+xml;utf-8,${svg}`);
  check("the QR is an SVG data URL", src?.startsWith("data:image/svg+xml;charset=utf-8,"), true);
  check("a # inside it cannot cut it short", src?.slice(5).includes("#"), false);
  check("it decodes to the same drawing", decodeURIComponent(src!.split(",").slice(1).join(",")), svg);
  check("anything else is not drawn: a web address", qrImageSrc("https://evil.example/qr.svg"), null);
  check("anything else is not drawn: a script URL", qrImageSrc("javascript:alert(1)"), null);
  check("anything else is not drawn: another data type", qrImageSrc("data:text/html,<script>1</script>"), null);
  check("anything else is not drawn: not an svg", qrImageSrc("data:image/svg+xml;utf-8,<script>1</script>"), null);
  check("nothing is not drawn", qrImageSrc(null), null);
}

// ─── The two flows, against a fake of supabase.auth.mfa ──────────────────────

type FakeOptions = {
  factors?: FactorLike[];
  listError?: MfaErrorLike;
  unenrollError?: MfaErrorLike;
  enrollError?: MfaErrorLike;
  challengeError?: MfaErrorLike;
  verifyError?: MfaErrorLike;
  throwOn?: "listFactors" | "enroll" | "challenge" | "verify";
};

function fakeMfa(options: FakeOptions = {}): { mfa: MfaLike; calls: string[] } {
  const calls: string[] = [];
  const maybeThrow = (name: FakeOptions["throwOn"]) => {
    if (options.throwOn === name) throw new Error("network down");
  };
  const mfa: MfaLike = {
    async listFactors() {
      calls.push("listFactors");
      maybeThrow("listFactors");
      if (options.listError) return { data: null, error: options.listError };
      return { data: { all: options.factors ?? [] }, error: null };
    },
    async unenroll({ factorId }) {
      calls.push(`unenroll:${factorId}`);
      return { error: options.unenrollError ?? null };
    },
    async enroll(params) {
      calls.push(`enroll:${params.factorType}:${params.issuer ?? ""}`);
      maybeThrow("enroll");
      if (options.enrollError) return { data: null, error: options.enrollError };
      return {
        data: {
          id: "new-factor",
          totp: { qr_code: 'data:image/svg+xml;utf-8,<svg viewBox="0 0 1 1"></svg>', secret: "JBSWY3DPEHPK3PXP" },
        },
        error: null,
      };
    },
    async challenge({ factorId }) {
      calls.push(`challenge:${factorId}`);
      maybeThrow("challenge");
      if (options.challengeError) return { data: null, error: options.challengeError };
      return { data: { id: "challenge-1" }, error: null };
    },
    async verify({ factorId, challengeId, code }) {
      calls.push(`verify:${factorId}:${challengeId}:${code}`);
      maybeThrow("verify");
      return { error: options.verifyError ?? null };
    },
  };
  return { mfa, calls };
}

async function flows() {
  console.log("startSetup: clear the leftover, then enroll");
  {
    const { mfa, calls } = fakeMfa();
    const result = await startSetup(mfa);
    check("a clean account: list, then enroll under our name", calls, ["listFactors", "enroll:totp:Tennis Bootcamp"]);
    check("it hands back the factor, the QR and the key", result.ok && [result.factorId, result.qr?.startsWith("data:image/svg+xml;charset=utf-8,"), result.secret], ["new-factor", true, "JBSWY3DPEHPK3PXP"]);
  }
  {
    const { mfa, calls } = fakeMfa({
      factors: [
        { id: "old-1", factor_type: "totp", status: "unverified" },
        { id: "old-2", factor_type: "totp", status: "unverified" },
      ],
    });
    const result = await startSetup(mfa);
    check("an abandoned attempt is removed before enrolling again", calls, ["listFactors", "unenroll:old-1", "unenroll:old-2", "enroll:totp:Tennis Bootcamp"]);
    check("and the set-up starts", result.ok, true);
  }
  {
    const { mfa, calls } = fakeMfa({
      factors: [
        { id: "live", factor_type: "totp", status: "verified" },
        { id: "old", factor_type: "totp", status: "unverified" },
      ],
    });
    await startSetup(mfa);
    check("a confirmed factor is never removed here", calls.includes("unenroll:live"), false);
    check("only the leftover is", calls.filter((c) => c.startsWith("unenroll:")), ["unenroll:old"]);
  }
  {
    const { mfa, calls } = fakeMfa({ factors: [{ id: "old", status: "unverified" }], unenrollError: { status: 500 } });
    check("a leftover that will not go stops the set-up", (await startSetup(mfa)).ok, false);
    check("and nothing is enrolled over it", calls.some((c) => c.startsWith("enroll")), false);
  }
  check("a list that fails stops the set-up", (await startSetup(fakeMfa({ listError: { status: 500 } }).mfa)).ok, false);
  check("an enrollment that fails stops the set-up", (await startSetup(fakeMfa({ enrollError: { status: 500 } }).mfa)).ok, false);
  check("a thrown error stops the set-up, without throwing", (await startSetup(fakeMfa({ throwOn: "enroll" }).mfa)).ok, false);

  console.log("submitCode: a fresh challenge, then the code");
  {
    const { mfa, calls } = fakeMfa();
    const result = await submitCode(mfa, "factor-1", "123456");
    check("challenge, then verify with that challenge and the code", calls, ["challenge:factor-1", "verify:factor-1:challenge-1:123456"]);
    check("a good code passes", result, { ok: true });
  }
  for (const bad of ["", "12345", "1234567", "12345a", "123 456"]) {
    const { mfa, calls } = fakeMfa();
    const result = await submitCode(mfa, "factor-1", bad);
    check(`${JSON.stringify(bad)} is refused`, result.ok, false);
    check(`${JSON.stringify(bad)} is never sent`, calls, []);
  }
  check("a wrong code", await submitCode(fakeMfa({ verifyError: { code: "mfa_verification_failed", status: 422 } }).mfa, "f", "000000"), { ok: false, kind: "wrong" });
  check("an expired challenge", await submitCode(fakeMfa({ verifyError: { code: "mfa_challenge_expired" } }).mfa, "f", "000000"), { ok: false, kind: "expired" });
  check("too many tries at the challenge", await submitCode(fakeMfa({ challengeError: { status: 429 } }).mfa, "f", "000000"), { ok: false, kind: "rateLimited" });
  check("a set-up whose factor is gone", await submitCode(fakeMfa({ challengeError: { code: "mfa_factor_not_found" } }).mfa, "f", "000000"), { ok: false, kind: "setupStale" });
  check("a thrown error is generic, without throwing", await submitCode(fakeMfa({ throwOn: "verify" }).mfa, "f", "000000"), { ok: false, kind: "generic" });
  {
    const { mfa, calls } = fakeMfa({ challengeError: { status: 500 } });
    await submitCode(mfa, "f", "000000");
    check("no verify without a challenge", calls, ["challenge:f"]);
  }
}

// ─── Source pins: one gate, and everything goes through it ───────────────────

function sourcePins() {
  console.log("Source: the gate reads verified sources only");
  {
    const gate = read("src/lib/adminAuth.ts");
    const state = read("src/lib/signInState.ts");
    check("the gate is server-only", gate.includes('import "server-only";') && state.includes('import "server-only";'));
    check("the user comes from getUser()", state.includes("supabase.auth.getUser()"));
    check("the level comes from getClaims()", state.includes("supabase.auth.getClaims()"));
    check("a level that cannot be read is logged, in fixed words", state.includes('console.error("Sign-in level not read: the claims were refused");') && state.includes('console.error("Sign-in level not read: the claims check failed");'));
    check("the log lines carry no user data", /console\.error\([^)]*(user|email|claims\.|error\b|err\b|\$\{)/.test(state), false);
    check("the claims must be the same user's", state.includes("claims.sub === user.id"));
    check("getSession() is never called", /getSession\(/.test(gate) || /getSession\(/.test(state), false);
    check("the unverified level helper is never called on the server", /getAuthenticatorAssuranceLevel\(/.test(gate) || /getAuthenticatorAssuranceLevel\(/.test(state), false);
    check("the decision is the pure function", gate.includes("const gate = adminGate({"));
    check("getAdminUser is an admin only for ok", gate.includes('return gate === "ok" ? user : null;'));
    check("that is its only way to return a user", (gate.slice(gate.indexOf("export async function getAdminUser")).match(/return (?!null)/g) ?? []).length, 1);
    check("a failure is nobody", /catch \(err\) \{\s*console\.error\("getAdminUser failed:", err\);\s*return null;/.test(gate));
    check("the redirect goes through the pure function", gate.includes("return adminRefusedHref(gate, path);"));
  }

  console.log("Source: every admin page goes through the gate");
  {
    const pages = filesUnder("src/app/admin", "page.tsx");
    check("admin pages found", pages.length >= 7, true);
    for (const page of pages) {
      const src = read(page);
      check(`${page}: asks the gate`, src.includes("const admin = await getAdminUser();"));
      check(`${page}: refused before anything renders`, /const admin = await getAdminUser\(\);\s*(?:\/\/[^\n]*\n\s*)*if \(!admin\) redirect\(await adminRefusedRedirect\(/.test(src));
      check(`${page}: checks no role of its own`, /role\s*[!=]==?\s*["']admin["']/.test(src), false);
    }
    check("no admin layout renders ahead of the pages", filesUnder("src/app/admin", "layout.tsx"), []);
  }

  console.log("Source: every admin API goes through the gate");
  {
    const routes = filesUnder("src/app/api", "route.ts").filter((path) => path.split("/").includes("admin"));
    check("admin APIs found (the assessment ones included)", [routes.length >= 8, routes.some((r) => r.startsWith("src/app/api/assessment/admin/")), routes.some((r) => r.startsWith("src/app/api/admin/"))], [true, true, true]);
    for (const route of routes) {
      const src = read(route);
      const handlers = src.match(/export (?:async )?function (?:GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
      const gated =
        src.match(/\{\s*const admin = await getAdminUser\(\);\s*if \(!admin\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\);/g) ?? [];
      check(`${route}: has handlers`, handlers.length > 0, true);
      check(`${route}: every handler opens with the gate and a 403`, gated.length, handlers.length);
      check(`${route}: no handler is exported another way`, /export const (?:GET|POST|PUT|PATCH|DELETE)\b/.test(src), false);
      check(`${route}: checks no role of its own`, /role\s*[!=]==?\s*["']admin["']/.test(src), false);
    }
    // No admin API lives outside those folders under another name.
    const others = filesUnder("src/app/api", "route.ts").filter((path) => !path.split("/").includes("admin"));
    for (const route of others) {
      check(`${route}: not an admin API in disguise`, read(route).includes("getAdminUser"), false);
    }
  }

  console.log("Source: the two pages decide on the server who sees them");
  {
    const code = read("src/app/login/code/page.tsx");
    check("the code page reads the verified state", code.includes("await readSignInState()"));
    check("signed out → /login with next", code.includes("if (!state) redirect(loginHref(next));"));
    check("nothing owed → straight on", code.includes("if (!owesCode || !state.totpFactorId) redirect(next);"));
    check("its next is a site path only", code.includes("safeNextPath("));
    check("it is never cached or indexed", code.includes('export const dynamic = "force-dynamic";') && code.includes("robots: { index: false, follow: false }"));

    const setup = read("src/app/login/code/setup/page.tsx");
    check("the set-up page asks the admin gate", setup.includes("const { gate } = await readAdminGate();"));
    check("already through → next", setup.includes('if (gate === "ok") redirect(next);'));
    check("anyone but an admin with no factor is sent away", setup.includes('if (gate !== "needs_setup") redirect(adminRefusedHref(gate, next));'));
    check("its next is a site path only", setup.includes("setupNextPath("));
    check("it is never cached or indexed", setup.includes('export const dynamic = "force-dynamic";') && setup.includes("robots: { index: false, follow: false }"));
    const form = read("src/components/auth/SetupForm.tsx");
    check("the set-up shows the QR and the key as text", form.includes("src={stage.setup.qr}") && form.includes("secretGroups(stage.setup.secret)"));
    check("one enrollment per visit", form.includes("if (started.current) return;"));
    check("neither form logs the key or the code", /console\./.test(form) || /console\./.test(read("src/components/auth/CodeForm.tsx")) || /console\./.test(read("src/lib/signInCode.ts")), false);
  }

  console.log("Source: the login page and the emailed link send a session that owes its code to the code page");
  {
    const login = read("src/app/login/page.tsx");
    check("the login page asks the levels after the password", /signInWithPassword\(\{ email, password \}\);[\s\S]*supabase\.auth\.mfa\.getAuthenticatorAssuranceLevel\(\)/.test(login));
    check("and routes through afterSignInPath, keeping next", login.includes("destination = afterSignInPath(levels, nextPath);"));
    check("and goes where that says", login.includes("router.push(destination);") && !login.includes("router.push(nextPath);"));
    check("a password failure still stops before any of it", login.indexOf("if (authError)") < login.indexOf("getAuthenticatorAssuranceLevel"));

    const callback = read("src/app/auth/callback/route.ts");
    check("the callback reads the verified state on its own client", callback.includes("await readSignInState(supabase)"));
    check("and routes through afterSignInPath, keeping next", /destination = afterSignInPath\(\s*\{ currentLevel: state\.aal, nextLevel: state\.totpFactorId \? "aal2" : "aal1" \},\s*next\s*\);/.test(callback));
    check("and redirects where that says", callback.includes("return NextResponse.redirect(`${origin}${destination}`);") && !callback.includes("NextResponse.redirect(`${origin}${next}`)"));
    check("only for a link that signed someone in", /let destination = next;\s*if \(signedIn\) \{/.test(callback));
    check("a refused link still goes to /login as a code", callback.includes("NextResponse.redirect(`${origin}/login?error=${error}`)"));
    check("it never forwards Supabase's message", callback.includes("error.message"), false);
  }

  console.log("Migration 0013: is_admin() asks for AAL2, and nothing else changes");
  {
    const path = "supabase/migrations/0013_admin_requires_code.sql";
    const sql = read(path);
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const verifyAt = statements.indexOf("select\n  p.prosecdef");
    check("the file is read with LF line endings", sql.includes("\r"), false);
    check("the verify query is found", verifyAt > 0, true);
    check("and it comes after the function and its grants", verifyAt > statements.indexOf("grant  execute on function public.is_admin() to authenticated;") && statements.indexOf("grant  execute") > 0, true);
    const beforeVerify = statements.slice(0, Math.max(verifyAt, 0));
    const verifyBlock = verifyAt > 0 ? statements.slice(verifyAt) : "";
    check("the verify query is not empty", verifyBlock.includes("from pg_proc p"), true);
    check("idempotent: create or replace", beforeVerify.includes("create or replace function public.is_admin()"));
    check("still security definer, stable, search_path = public", beforeVerify.includes("returns boolean language sql security definer stable set search_path = public as $$"));
    check("still the role check", /from public\.profiles\s+where id = \(select auth\.uid\(\)\) and role = 'admin'/.test(beforeVerify));
    check("and now the session's level", beforeVerify.includes("and (select auth.jwt()->>'aal') = 'aal2'"));
    check("the two are joined by and, never or", /\bor\b/.test(beforeVerify.replace("create or replace", "")), false);
    check("a missing claim is false, never null", beforeVerify.includes("select coalesce(") && /,\s*false\s*\);/.test(beforeVerify));
    check("grants unchanged: revoked from public and anon", beforeVerify.includes("revoke execute on function public.is_admin() from public, anon;"));
    check("grants unchanged: granted to authenticated", /grant\s+execute on function public\.is_admin\(\) to authenticated;/.test(beforeVerify));
    check("additive: nothing dropped, altered or deleted", /\b(drop|alter|delete|truncate|update|insert)\b/i.test(beforeVerify), false);
    check("no policy is touched", /\bpolicy\b/i.test(beforeVerify), false);
    check("it carries a verify block", sql.includes("-- verify:"));
    check("the verify block reads only", /\b(drop|alter|delete|truncate|update|insert|create|grant|revoke)\b/i.test(verifyBlock), false);
    check("the verify block checks the body and the policies", sql.includes("as requires_aal2") && sql.includes("as policies_calling_is_admin"));
    // The definition it replaces, so a later edit to either is noticed.
    check("0002 still holds the first definition", read("supabase/migrations/0002_assessments.sql").includes("create or replace function public.is_admin()"));
    const others = readdirSync(join(ROOT, "supabase/migrations")).filter(
      (f) => f.endsWith(".sql") && !f.startsWith("0002_") && !f.startsWith("0013_")
    );
    check("no other migration redefines it", others.some((f) => /function public\.is_admin\(\)/.test(read(`supabase/migrations/${f}`))), false);
  }

  console.log("Wiring: this file runs in npm test");
  check("package.json runs it", read("package.json").includes("npx tsx src/scripts/test-sign-in-code.ts"));
}

flows()
  .then(() => {
    sourcePins();
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed.`);
      process.exit(1);
    }
    console.log("\nAll sign-in code checks passed.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

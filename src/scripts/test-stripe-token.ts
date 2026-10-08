// Run from project root: npx tsx src/scripts/test-stripe-token.ts
// Pins backlog #30: nothing handed to Stripe for an enrollment checkout
// carries the invite token (not cancel_url, not success_url, not metadata),
// the webhook links a payment to its invite by row id, the resume cookie is
// httpOnly and scoped to the cohort's enroll page, and every route sends
// Referrer-Policy: strict-origin-when-cross-origin.
// Backlog #34 follow-ups: the resume cookie is cleared on the success return
// (same name, path and flags, expired), a declined invite is refused with a
// 409 before any Stripe session exists, and the success URL's invite flag
// follows the id Stripe is given.

import nextConfig, { REFERRER_POLICY } from "../../next.config";
import {
  checkoutInviteLink,
  DECLINED_INVITE_ERROR,
  enrollReturnUrls,
  enrollSuccessCohortId,
  inviteResumeClearCookie,
  type CheckoutInviteDecision,
  inviteResumeCookie,
  inviteLinkFromMetadata,
  INVITE_RESUME_COOKIE,
  INVITE_RESUME_MAX_AGE_SECONDS,
} from "../lib/checkoutInvite";
import { enrollmentSessionParams } from "../lib/payments";

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

const TOKEN = "tok_8f3a9c2e5b7d4a1f";
const INVITE_ID = "2f6b1c4e-9a3d-4e8f-b7c2-1d5e6f7a8b9c";
const ORIGIN = "https://tennisbootcamp.ca";

console.log("enrollReturnUrls");
{
  const single = enrollReturnUrls({
    origin: ORIGIN,
    cohortId: "coh_1",
    enrollmentRowNumber: 12,
    playerCount: 1,
    hasInvite: true,
  });
  check("cancel_url is the bare enroll page", single.cancelUrl, `${ORIGIN}/enroll/coh_1`);
  check(
    "success_url keeps row and the invite=1 flag",
    single.successUrl,
    `${ORIGIN}/enroll/coh_1/confirmed?row=12&invite=1`
  );
  const household = enrollReturnUrls({
    origin: ORIGIN,
    cohortId: "coh_1",
    enrollmentRowNumber: 12,
    playerCount: 2,
    hasInvite: false,
  });
  check(
    "household success_url keeps players, no invite flag",
    household.successUrl,
    `${ORIGIN}/enroll/coh_1/confirmed?row=12&players=2`
  );
  check("household cancel_url unchanged", household.cancelUrl, `${ORIGIN}/enroll/coh_1`);
}

console.log("enrollmentSessionParams");
{
  const urls = enrollReturnUrls({
    origin: ORIGIN,
    cohortId: "coh_1",
    enrollmentRowNumber: 12,
    playerCount: 2,
    hasInvite: true,
  });
  const params = enrollmentSessionParams(
    {
      cohortId: "coh_1",
      programTitle: "Adult Bootcamp",
      priceCents: 21000,
      quantity: 2,
      enrollmentRowNumber: 12,
      enrollmentRowNumbers: [12, 13],
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      contactEmail: "player@example.com",
      supabaseEnrollmentId: "enr_1",
      discountCents: 4000,
      assessmentBookingId: "bk_1",
      assessmentBookingIds: ["bk_1", "bk_2"],
      participantIds: ["p_1", "p_2"],
      inviteId: INVITE_ID,
    },
    [{ coupon: "cpn_1" }]
  );
  const wire = JSON.stringify(params);
  check("token never appears in the Stripe request", wire.includes(TOKEN), false);
  check("no inviteToken metadata key", "inviteToken" in (params.metadata ?? {}), false);
  check("metadata.inviteId is the invite row id", params.metadata?.inviteId, INVITE_ID);
  check("cancel_url has no query", params.cancel_url, `${ORIGIN}/enroll/coh_1`);
  check(
    "success_url semantics unchanged",
    params.success_url,
    `${ORIGIN}/enroll/coh_1/confirmed?row=12&players=2&invite=1`
  );
  check("currency unchanged", params.line_items?.[0]?.price_data?.currency, "cad");
  check("unit amount unchanged", params.line_items?.[0]?.price_data?.unit_amount, 21000);
  check("quantity unchanged", params.line_items?.[0]?.quantity, 2);
  check("discount clamp unchanged", params.metadata?.assessmentCreditCents, "4000");
  check("discounts passed through", params.discounts, [{ coupon: "cpn_1" }]);
  check(
    "household metadata unchanged",
    [
      params.metadata?.enrollmentRowNumbers,
      params.metadata?.assessmentBookingIds,
      params.metadata?.participantIds,
    ],
    ["12,13", "bk_1,bk_2", "p_1,p_2"]
  );
  const noInvite = enrollmentSessionParams({
    cohortId: "coh_1",
    programTitle: "Adult Bootcamp",
    priceCents: 0,
    enrollmentRowNumber: 3,
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
  });
  check("no invite → empty inviteId, as the webhook expects", noInvite.metadata?.inviteId, "");
  check("unset price → 1 CAD placeholder unchanged", noInvite.line_items?.[0]?.price_data?.unit_amount, 100);
}

/** Mirrors the route: a refusal never reaches enrollmentSessionParams. */
function proceed(decision: CheckoutInviteDecision): { inviteId?: string; setResumeCookie: boolean } {
  if (decision.kind === "refuse") {
    throw new Error(`refused before Stripe: ${decision.error}`);
  }
  const { inviteId, setResumeCookie } = decision;
  return { inviteId, setResumeCookie };
}

console.log("checkoutInviteLink (what the route sends Stripe and the browser)");
{
  check(
    "valid invite → id in metadata and the cancel-return cookie",
    checkoutInviteLink({ lookup: { state: "valid", invite: { id: INVITE_ID } }, rowByToken: null }),
    { kind: "proceed", inviteId: INVITE_ID, setResumeCookie: true }
  );
  check(
    "invite expired between page load and paying → still its own row id, no cookie",
    checkoutInviteLink({ lookup: { state: "expired" }, rowByToken: { id: INVITE_ID, status: "expired" } }),
    { kind: "proceed", inviteId: INVITE_ID, setResumeCookie: false }
  );
  check(
    "token matches no row → nothing for Stripe, webhook falls back to email",
    checkoutInviteLink({ lookup: { state: "invalid" }, rowByToken: null }),
    { kind: "proceed", inviteId: undefined, setResumeCookie: false }
  );
  check(
    "no token at all → nothing",
    checkoutInviteLink({ lookup: null, rowByToken: null }),
    { kind: "proceed", inviteId: undefined, setResumeCookie: false }
  );
  const returnUrls = enrollReturnUrls({
    origin: ORIGIN,
    cohortId: "coh_1",
    enrollmentRowNumber: 3,
    playerCount: 1,
    hasInvite: true,
  });
  const expiredParams = enrollmentSessionParams({
    cohortId: "coh_1",
    programTitle: "Adult Bootcamp",
    priceCents: 21000,
    enrollmentRowNumber: 3,
    successUrl: returnUrls.successUrl,
    cancelUrl: returnUrls.cancelUrl,
    ...proceed(
      checkoutInviteLink({ lookup: { state: "expired" }, rowByToken: { id: INVITE_ID, status: "expired" } })
    ),
  });
  check(
    "expired-mid-checkout session still carries the invite id, never the token",
    [expiredParams.metadata?.inviteId, JSON.stringify(expiredParams).includes(TOKEN)],
    [INVITE_ID, false]
  );
  check(
    "webhook links that session by id",
    inviteLinkFromMetadata(expiredParams.metadata as Record<string, string>),
    { inviteId: INVITE_ID }
  );
}

console.log("inviteLinkFromMetadata (webhook linkage)");
{
  check(
    "new session links by inviteId",
    inviteLinkFromMetadata({ inviteId: INVITE_ID, inviteToken: "" }),
    { inviteId: INVITE_ID }
  );
  check(
    "session created before this deploy still links by its token",
    inviteLinkFromMetadata({ inviteToken: TOKEN }),
    { legacyInviteToken: TOKEN }
  );
  check(
    "id wins when both are present",
    inviteLinkFromMetadata({ inviteId: INVITE_ID, inviteToken: TOKEN }),
    { inviteId: INVITE_ID }
  );
  check("blank metadata → nothing to link", inviteLinkFromMetadata({ inviteId: " " }), {});
  check("missing metadata → nothing to link", inviteLinkFromMetadata(null), {});
}

console.log("inviteResumeCookie");
{
  const cookie = inviteResumeCookie("coh_1", TOKEN, { secure: true });
  check("name", cookie.name, INVITE_RESUME_COOKIE);
  check("value is the token", cookie.value, TOKEN);
  check("httpOnly", cookie.httpOnly, true);
  check("sameSite lax", cookie.sameSite, "lax");
  check("secure in production", cookie.secure, true);
  check("scoped to the cohort's enroll page", cookie.path, "/enroll/coh_1");
  check("lives as long as a Stripe session", cookie.maxAge, INVITE_RESUME_MAX_AGE_SECONDS);
  check("24 hours", INVITE_RESUME_MAX_AGE_SECONDS, 86400);
  check("insecure flag only when asked", inviteResumeCookie("coh_1", TOKEN, { secure: false }).secure, false);
}

console.log("inviteResumeClearCookie (#34: success return clears the cookie)");
{
  const set = inviteResumeCookie("coh_1", TOKEN, { secure: true });
  const clear = inviteResumeClearCookie("coh_1", { secure: true });
  check("same name as the cookie that was set", clear.name, set.name);
  check("same path, so the browser matches the right cookie", clear.path, set.path);
  check("same flags (httpOnly, sameSite, secure)", [clear.httpOnly, clear.sameSite, clear.secure], [set.httpOnly, set.sameSite, set.secure]);
  check("expired, not re-issued", clear.maxAge, 0);
  check("value emptied — the token is not sent back", clear.value, "");
  check("token never appears in the clearing cookie", JSON.stringify(clear).includes(TOKEN), false);
  check("dev flags match the dev set cookie", inviteResumeClearCookie("coh_1", { secure: false }).secure, false);
}

console.log("enrollSuccessCohortId (which path clears it)");
{
  check("success return", enrollSuccessCohortId("/enroll/coh_1/confirmed"), "coh_1");
  check("trailing slash tolerated", enrollSuccessCohortId("/enroll/coh_1/confirmed/"), "coh_1");
  check("uuid cohort id", enrollSuccessCohortId(`/enroll/${INVITE_ID}/confirmed`), INVITE_ID);
  check("encoded id decoded", enrollSuccessCohortId("/enroll/coh%201/confirmed"), "coh 1");
  check("the enroll page itself (cancel return) does not clear", enrollSuccessCohortId("/enroll/coh_1"), null);
  check("enroll page with trailing slash does not clear", enrollSuccessCohortId("/enroll/coh_1/"), null);
  check("a deeper path does not clear", enrollSuccessCohortId("/enroll/coh_1/confirmed/x"), null);
  check("another cohort's confirmed is its own id", enrollSuccessCohortId("/enroll/coh_2/confirmed"), "coh_2");
  check("unrelated route", enrollSuccessCohortId("/dashboard"), null);
  check("checkout API route", enrollSuccessCohortId("/api/checkout"), null);
  check("no cohort segment", enrollSuccessCohortId("/enroll//confirmed"), null);
  let threw = false;
  let malformed: string | null = "unset";
  try {
    malformed = enrollSuccessCohortId("/enroll/%ZZ/confirmed");
  } catch {
    threw = true;
  }
  check("malformed escape never throws (middleware fail-safe)", threw, false);
  check("malformed escape → null, nothing cleared", malformed, null);
  check("bare % is tolerated too", enrollSuccessCohortId("/enroll/%/confirmed"), null);
}

console.log("declined invite (#34: refused before any Stripe session)");
{
  // The route: a declined token reads "invalid" at the gate, so the row comes
  // from findInviteRefByToken; its status decides, and the decision is a
  // refusal the route returns as a 409 before enrollment rows or Stripe.
  const declined = checkoutInviteLink({
    lookup: { state: "invalid" },
    rowByToken: { id: INVITE_ID, status: "declined" },
  });
  check("declined token → refuse with 409", declined, {
    kind: "refuse",
    status: 409,
    error: DECLINED_INVITE_ERROR,
  });
  check(
    "refusal wording: what's wrong and the one way out",
    [
      DECLINED_INVITE_ERROR.includes("declined"),
      DECLINED_INVITE_ERROR.includes("info@tennisbootcamp.ca"),
      DECLINED_INVITE_ERROR.includes("!"),
    ],
    [true, true, false]
  );
  check(
    "declined wins even if the gate read valid (status changed between reads)",
    checkoutInviteLink({
      lookup: { state: "valid", invite: { id: INVITE_ID } },
      rowByToken: { id: INVITE_ID, status: "declined" },
    }).kind,
    "refuse"
  );
  let reachedStripe = false;
  let refusedWith = "";
  try {
    enrollmentSessionParams({
      cohortId: "coh_1",
      programTitle: "Adult Bootcamp",
      priceCents: 21000,
      enrollmentRowNumber: 3,
      successUrl: `${ORIGIN}/enroll/coh_1/confirmed?row=3`,
      cancelUrl: `${ORIGIN}/enroll/coh_1`,
      ...proceed(declined),
    });
    reachedStripe = true;
  } catch (err) {
    refusedWith = err instanceof Error ? err.message : String(err);
  }
  check("a declined lookup never reaches enrollmentSessionParams", reachedStripe, false);
  check("…and it is the refusal that stopped it", refusedWith.includes(DECLINED_INVITE_ERROR), true);
  check("refusal carries no token", JSON.stringify(declined).includes(TOKEN), false);
  check(
    "other statuses still proceed by id",
    (["invited", "expired", "paid"] as const).map(
      (status) => checkoutInviteLink({ lookup: { state: "expired" }, rowByToken: { id: INVITE_ID, status } })
    ),
    [
      { kind: "proceed", inviteId: INVITE_ID, setResumeCookie: false },
      { kind: "proceed", inviteId: INVITE_ID, setResumeCookie: false },
      { kind: "proceed", inviteId: INVITE_ID, setResumeCookie: false },
    ]
  );
}

console.log("success URL invite flag follows the id Stripe gets (#34)");
{
  const url = (inviteId: string | undefined) =>
    enrollReturnUrls({
      origin: ORIGIN,
      cohortId: "coh_1",
      enrollmentRowNumber: 3,
      playerCount: 1,
      hasInvite: Boolean(inviteId),
    }).successUrl;
  const valid = proceed(checkoutInviteLink({ lookup: { state: "valid", invite: { id: INVITE_ID } }, rowByToken: null }));
  const expired = proceed(checkoutInviteLink({ lookup: { state: "expired" }, rowByToken: { id: INVITE_ID, status: "expired" } }));
  const unknown = proceed(checkoutInviteLink({ lookup: { state: "invalid" }, rowByToken: null }));
  const none = proceed(checkoutInviteLink({ lookup: null, rowByToken: null }));
  check("valid invite → invite=1", url(valid.inviteId), `${ORIGIN}/enroll/coh_1/confirmed?row=3&invite=1`);
  check("expired mid-checkout → invite=1 (still settles on its row)", url(expired.inviteId), `${ORIGIN}/enroll/coh_1/confirmed?row=3&invite=1`);
  check("unknown token → no invite flag", url(unknown.inviteId), `${ORIGIN}/enroll/coh_1/confirmed?row=3`);
  check("no token → no invite flag", url(none.inviteId), `${ORIGIN}/enroll/coh_1/confirmed?row=3`);
}

async function headerChecks() {
  console.log("Referrer-Policy header");
  const rules = await nextConfig.headers!();
  const all = rules.find((r) => r.source === "/:path*");
  check("one rule covers every route", Boolean(all), true);
  check(
    "Referrer-Policy value",
    all?.headers.find((h) => h.key === "Referrer-Policy")?.value,
    "strict-origin-when-cross-origin"
  );
  check("exported constant matches", REFERRER_POLICY, "strict-origin-when-cross-origin");
}

headerChecks().then(() => {
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
});

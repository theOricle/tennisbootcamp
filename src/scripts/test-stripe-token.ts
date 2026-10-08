// Run from project root: npx tsx src/scripts/test-stripe-token.ts
// Pins backlog #30: nothing handed to Stripe for an enrollment checkout
// carries the invite token (not cancel_url, not success_url, not metadata),
// the webhook links a payment to its invite by row id, the resume cookie is
// httpOnly and scoped to the cohort's enroll page, and every route sends
// Referrer-Policy: strict-origin-when-cross-origin.

import nextConfig, { REFERRER_POLICY } from "../../next.config";
import {
  enrollReturnUrls,
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

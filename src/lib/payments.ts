import Stripe from "stripe";

/**
 * How card payments run (backlog #84, audit follow-up, owner 2026-11-14):
 *   stripe  a Stripe key is set. Stripe's own keys decide test or live; the
 *           webhook records a test-key payment as a test (src/lib/stripeOutcome.ts).
 *   mock    no key, outside production (local development, a preview): no
 *           money moves and every row it writes is a test row.
 *   refuse  no key in production (VERCEL_ENV === "production"): checkout and
 *           booking payment are refused with a plain line, before any row or
 *           hold exists. Nothing in production is ever paid without Stripe.
 * Read at call time, never at module load, so a deploy's env decides it.
 */
export type PaymentRail = "stripe" | "mock" | "refuse";

export function paymentRail(
  env: { stripeKey?: string; vercelEnv?: string } = {
    stripeKey: process.env.STRIPE_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  }
): PaymentRail {
  if ((env.stripeKey ?? "").trim()) return "stripe";
  return env.vercelEnv === "production" ? "refuse" : "mock";
}

/**
 * Whether a card payment taken now is a test payment (backlog #84, review):
 * mock mode, or a Stripe key that is not a live one (sk_test_, rk_test_).
 * Every session a test key makes is livemode false, which the webhook records
 * as a test (src/lib/stripeOutcome.ts): it holds no seat or slot and sends no
 * email, so the page after it says so (src/lib/paymentConfirmation.ts). False
 * when production refuses card payment: then no card payment is taken at all.
 */
export function cardPaymentIsTest(
  env: { stripeKey?: string; vercelEnv?: string } = {
    stripeKey: process.env.STRIPE_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  }
): boolean {
  const rail = paymentRail(env);
  if (rail === "mock") return true;
  if (rail === "refuse") return false;
  return !/^(sk|rk)_live_/.test((env.stripeKey ?? "").trim());
}

/**
 * The assessment's price in cents: ASSESSMENT_PRICE_CENTS when it is set to
 * a price (0 makes the assessment free), else $20. One reading for the
 * booking route and the page after it.
 */
export function assessmentPriceCents(
  raw: string | undefined = process.env.ASSESSMENT_PRICE_CENTS
): number {
  const n = raw == null || raw === "" ? 2000 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

/** The 503 checkout answers when production has no Stripe key. */
export const CARD_PAYMENT_UNAVAILABLE =
  "Card payment isn't available right now, and nothing was charged. Email info@tennisbootcamp.ca and our coaches will finish your enrollment with you.";

/** The 503 the assessment booking answers when production has no Stripe key. */
export const ASSESSMENT_PAYMENT_UNAVAILABLE =
  "Card payment isn't available right now, and nothing was charged. Email info@tennisbootcamp.ca and we'll book your assessment with you.";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const stripeKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(stripeKey);
  }
  return _stripe;
}

/** Stripe is the only rail that may create a session; refuse and mock never reach it. */
function assertNotRefused(): "stripe" | "mock" {
  const rail = paymentRail();
  if (rail === "refuse") throw new Error("Card payment refused: no Stripe key in production");
  return rail;
}

export type EnrollmentCheckoutParams = {
  cohortId: string;
  programTitle: string;
  /** Price for ONE seat. `quantity` multiplies it. */
  priceCents: number;
  enrollmentRowNumber: number;
  successUrl: string;
  cancelUrl: string;
  contactEmail?: string;
  supabaseEnrollmentId?: string;
  // Phase 3: $20 assessment credit applied as a Checkout discount, and the
  // invite row id carried through so the webhook can mark the invite paid.
  // Never the token itself (backlog #30): Stripe only sees an identifier.
  discountCents?: number;
  assessmentBookingId?: string;
  inviteId?: string;
  // Household accounts (backlog #11): one payer, several players. Each player
  // is a seat, a Sheet row, an invite and their own $20 credit.
  quantity?: number;
  enrollmentRowNumbers?: number[];
  assessmentBookingIds?: string[];
  participantIds?: string[];
  /**
   * Every player's Supabase enrollment row (one per seat). The webhook flips
   * them all to paid; before this only the first player's row was carried,
   * so a household card payment left a sibling's row "pending" — which the
   * dashboard now reads as "Payment pending" (audit M25).
   */
  supabaseEnrollmentIds?: string[];
};

/**
 * A session is never built without a price (safety review). The routes refuse
 * a cohort with none first (priceRefusal, src/lib/enrollGate.ts); this is the
 * last line, so Stripe is never asked for a made-up amount.
 */
function assertPriced(priceCents: number): void {
  if (!(Number.isFinite(priceCents) && priceCents > 0)) {
    throw new Error("Enrollment checkout refused: the cohort has no price");
  }
}

/** The seat count and the discount Stripe is asked for, after clamping. */
export function enrollmentCheckoutTotals(params: EnrollmentCheckoutParams): {
  quantity: number;
  discountCents: number;
} {
  const quantity = Math.max(1, params.quantity ?? 1);
  const totalCents = (params.priceCents > 0 ? params.priceCents : 0) * quantity;
  const discountCents = Math.min(params.discountCents ?? 0, totalCents);
  return { quantity, discountCents };
}

/**
 * Everything the enrollment Checkout session is created with, minus the
 * coupon (which needs a Stripe round-trip first). Pure, so `npm test` can pin
 * that nothing sent to Stripe carries the invite token.
 */
export function enrollmentSessionParams(
  params: EnrollmentCheckoutParams,
  discounts?: { coupon: string }[]
): Stripe.Checkout.SessionCreateParams {
  assertPriced(params.priceCents);
  const { quantity, discountCents } = enrollmentCheckoutTotals(params);
  return {
    mode: "payment",
    // Card only (backlog #84): the payment is settled when the session
    // completes, so nothing can arrive later and "paid" means paid.
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "cad",
          product_data: { name: params.programTitle },
          // The cohort's own price, never a placeholder.
          unit_amount: params.priceCents,
        },
        quantity,
      },
    ],
    discounts,
    metadata: {
      cohortId: params.cohortId,
      enrollmentRowNumber: String(params.enrollmentRowNumber),
      contactEmail: params.contactEmail ?? "",
      supabaseEnrollmentId: params.supabaseEnrollmentId ?? "",
      assessmentBookingId: params.assessmentBookingId ?? "",
      assessmentCreditCents: discountCents > 0 ? String(discountCents) : "",
      inviteId: params.inviteId ?? "",
      // Household accounts: the full set, comma-joined. The singular fields
      // above stay populated with the first entry so an in-flight session
      // created before this deploy still settles correctly.
      enrollmentRowNumbers: (params.enrollmentRowNumbers ?? []).join(","),
      assessmentBookingIds: (params.assessmentBookingIds ?? []).join(","),
      participantIds: (params.participantIds ?? []).join(","),
      supabaseEnrollmentIds: (params.supabaseEnrollmentIds ?? []).join(","),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  };
}

export async function createCheckoutSession(
  params: EnrollmentCheckoutParams
): Promise<{ sessionUrl: string }> {
  // Before the mock branch too: a test run refuses what a live one would.
  assertPriced(params.priceCents);
  if (assertNotRefused() === "mock") {
    return { sessionUrl: params.successUrl };
  }

  const stripe = getStripe();
  const { discountCents } = enrollmentCheckoutTotals(params);

  let discounts: { coupon: string }[] | undefined;
  if (discountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: "cad",
      duration: "once",
      name: "Assessment credit",
    });
    discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe.checkout.sessions.create(
    enrollmentSessionParams(params, discounts)
  );

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { sessionUrl: session.url };
}

// ─── Assessment checkout (Phase 1) ────────────────────────────────────────────
// Separate from enrollment checkout; the webhook distinguishes assessment
// sessions by metadata.kind === "assessment".

export type AssessmentCheckoutParams = {
  bookingId: string;
  priceCents: number;
  successUrl: string;
  cancelUrl: string;
  contactEmail?: string;
};

/** The assessment Checkout session, as Stripe is asked for it. Pure, for npm test. */
export function assessmentSessionParams(
  params: AssessmentCheckoutParams
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    // Card only (backlog #84), as for enrollments.
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "cad",
          product_data: { name: "20-Minute Player Assessment" },
          unit_amount: params.priceCents > 0 ? params.priceCents : 100,
        },
        quantity: 1,
      },
    ],
    customer_email: params.contactEmail || undefined,
    metadata: {
      kind: "assessment",
      bookingId: params.bookingId,
      contactEmail: params.contactEmail ?? "",
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  };
}

export async function createAssessmentCheckoutSession(
  params: AssessmentCheckoutParams
): Promise<{ sessionUrl: string; stripeSessionId: string | null }> {
  if (assertNotRefused() === "mock") {
    return { sessionUrl: params.successUrl, stripeSessionId: null };
  }

  const session = await getStripe().checkout.sessions.create(assessmentSessionParams(params));

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { sessionUrl: session.url, stripeSessionId: session.id };
}

export { getStripe };

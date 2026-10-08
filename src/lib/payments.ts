import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
export const isMockMode = !stripeKey;

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(stripeKey);
  }
  return _stripe;
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
};

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
  const { quantity, discountCents } = enrollmentCheckoutTotals(params);
  return {
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "cad",
          product_data: { name: params.programTitle },
          // Stripe requires a positive integer; use 1 CAD as placeholder when price not yet set
          unit_amount: params.priceCents > 0 ? params.priceCents : 100,
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
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  };
}

export async function createCheckoutSession(
  params: EnrollmentCheckoutParams
): Promise<{ sessionUrl: string }> {
  if (isMockMode) {
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

export async function createAssessmentCheckoutSession(params: {
  bookingId: string;
  priceCents: number;
  successUrl: string;
  cancelUrl: string;
  contactEmail?: string;
}): Promise<{ sessionUrl: string; stripeSessionId: string | null }> {
  if (isMockMode) {
    return { sessionUrl: params.successUrl, stripeSessionId: null };
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
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
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { sessionUrl: session.url, stripeSessionId: session.id };
}

export { getStripe };

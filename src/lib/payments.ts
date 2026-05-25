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

export async function createCheckoutSession(params: {
  cohortId: string;
  programTitle: string;
  priceCents: number;
  enrollmentRowNumber: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionUrl: string }> {
  if (isMockMode) {
    return { sessionUrl: params.successUrl };
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "cad",
          product_data: { name: params.programTitle },
          // Stripe requires a positive integer; use 1 CAD as placeholder when price not yet set
          unit_amount: params.priceCents > 0 ? params.priceCents : 100,
        },
        quantity: 1,
      },
    ],
    metadata: {
      cohortId: params.cohortId,
      enrollmentRowNumber: String(params.enrollmentRowNumber),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { sessionUrl: session.url };
}

export { getStripe };

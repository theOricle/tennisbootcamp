// What the two pages after a payment say: the enrollment confirmation
// (/enroll/[cohortId]/confirmed) and the booked assessment
// (/assessment/booked). Backlog #84, review: a test payment (mock mode, or a
// Stripe key that is not live; src/lib/payments.ts cardPaymentIsTest) holds
// no spot, books nothing and sends no email, so its page says exactly that
// and promises none of what follows a live payment. A live payment's words,
// and the e-transfer page's, are unchanged.
//
// Pure, so src/scripts/test-paid-only.ts reads every state.

export const TEST_PAYMENT_BADGE = "Test payment";
export const TEST_PAYMENT_HEADING = "This was a test payment.";
export const TEST_PAYMENT_ENROLL_LINE =
  "Card payments are in test mode, so no money was taken. Nothing was booked: no spot is held in this cohort and no email was sent.";
export const TEST_PAYMENT_BOOKING_LINE =
  "Card payments are in test mode, so no money was taken. Nothing was booked and no email was sent.";

/** The status icon: a check for what stands, an "i" for a test payment. */
export type ConfirmationIcon = "check" | "info";

export type EnrollConfirmation = {
  /** The browser tab's title and the page's description. */
  title: string;
  description: string;
  badge: string;
  icon: ConfirmationIcon;
  heading: string;
  lead: string;
  /** "What happens next"; none after a test payment, which leads nowhere. */
  nextSteps: string[];
};

/**
 * The enrollment confirmation's words. `testPayment` counts only for a card
 * payment: an e-transfer page is never a test page, since no card was used.
 */
export function enrollConfirmation(input: {
  viaEtransfer: boolean;
  testPayment: boolean;
  signedIn: boolean;
  firstName: string | null;
}): EnrollConfirmation {
  const { viaEtransfer, signedIn, firstName } = input;
  if (input.testPayment && !viaEtransfer) {
    return {
      title: TEST_PAYMENT_BADGE,
      description: TEST_PAYMENT_HEADING,
      badge: TEST_PAYMENT_BADGE,
      icon: "info",
      heading: TEST_PAYMENT_HEADING,
      lead: TEST_PAYMENT_ENROLL_LINE,
      nextSteps: [],
    };
  }
  // Audit H5: an email that already had an account gets no activation link
  // any more — the enrollment is linked to that account and the email says
  // so — so the steps only promise what each visitor will actually get. A
  // guest (owner, 2026-10-12) is told to check their email for the link
  // that sets up the account, and what the dashboard will show them.
  const nextSteps = [
    ...(viaEtransfer
      ? ["Send the e-transfer if you haven't yet — the amount, address, and message are in your email."]
      : []),
    ...(signedIn
      ? ["This enrollment is on your dashboard, with the weekly schedule and, once the group is set, every session date."]
      : [
          "Check your email for the link to set up your account: it names the players you enrolled and sets your password. Already signed in to an account with this email before? You'll get a note that this enrollment is on it instead.",
          "Your dashboard then shows this enrollment, each player's level once our coaches set it, the weekly slot and, once the group is set, every session date.",
        ]),
    viaEtransfer
      ? "Once the coach confirms your transfer arrived and the group reaches its minimum, you'll get the full session schedule by email."
      : "We'll send reminders before your first session with court details and what to bring.",
  ];
  return {
    title: "Enrollment Confirmed",
    description: "Your Tennis Bootcamp enrollment has been confirmed.",
    // E-transfer cohorts land here after "I've sent it": the spot is held,
    // not paid, until the coach confirms receipt in the admin.
    badge: viaEtransfer ? "Spot Held" : "Payment Received",
    icon: "check",
    heading: viaEtransfer
      ? firstName
        ? `${firstName}, your spot is held.`
        : "Your spot is held."
      : firstName
        ? `${firstName}, you're enrolled.`
        : "You're enrolled.",
    lead: viaEtransfer
      ? "Once the coach confirms your e-transfer arrived, you're in and the confirmation email follows. The amount, the address, and the message to put on the transfer are in your inbox."
      : "Your payment is confirmed and your spot is reserved. Everything below is what you signed up for — save this page or check your email for a receipt.",
    nextSteps,
  };
}

export type BookedConfirmation = {
  /** The browser tab's title and the page's description. */
  title: string;
  description: string;
  icon: ConfirmationIcon;
  heading: string;
  /** Show the booked slot's date and time; nothing was booked after a test payment. */
  showSlot: boolean;
  lead: string;
  note: string | null;
};

/**
 * The booked assessment's words. A free ($0) assessment books and sends as a
 * live one does; only a paid assessment on a test rail is a test payment.
 */
export function bookedConfirmation(input: { testPayment: boolean }): BookedConfirmation {
  if (input.testPayment) {
    return {
      title: TEST_PAYMENT_BADGE,
      description: TEST_PAYMENT_HEADING,
      icon: "info",
      heading: TEST_PAYMENT_HEADING,
      showSlot: false,
      lead: TEST_PAYMENT_BOOKING_LINE,
      note: null,
    };
  }
  return {
    // As the layout's (src/app/assessment/booked/layout.tsx).
    title: "You're booked",
    description: "Your assessment is confirmed.",
    icon: "check",
    heading: "You're booked.",
    showSlot: true,
    lead: "Your 20-minute assessment is confirmed. We've sent the details to your email — slot time, what to bring, and how to reach us if you need to move it.",
    note: "See you on the court. Bring a racquet if you have one, water, and court shoes.",
  };
}

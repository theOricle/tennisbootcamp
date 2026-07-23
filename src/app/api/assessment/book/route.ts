import { NextRequest, NextResponse } from "next/server";
import { isMockMode, createAssessmentCheckoutSession } from "@/lib/payments";
import {
  createPendingBooking,
  createRequestedBooking,
  confirmBooking,
  SlotTakenError,
} from "@/lib/assessments";
import { createServiceClient } from "@/lib/supabase/service";
import { parseAvailability } from "@/lib/availability";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assessmentPriceCents(): number {
  const raw = process.env.ASSESSMENT_PRICE_CENTS;
  const n = raw == null || raw === "" ? 2000 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const blockId = String(body.blockId ?? "").trim();
    const slotStart = String(body.slotStart ?? "").trim();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const selfLevel = body.selfLevel ? String(body.selfLevel).trim() : null;
    const availability = body.availability
      ? parseAvailability(body.availability)
      : null;

    // Request mode (Phase 2.6): no slot, no payment — the admin coordinates the
    // time directly. Creates a `requested` booking and fires both emails.
    if (body.mode === "request") {
      if (!name || !isValidEmail(email)) {
        return NextResponse.json(
          { error: "Please provide your name and a valid email." },
          { status: 400 }
        );
      }
      await createRequestedBooking({
        name,
        email,
        phone,
        selfLevel,
        availability,
        requestNote: body.note ? String(body.note).trim().slice(0, 1000) : null,
      });
      return NextResponse.json({ requested: true });
    }

    if (!blockId || !slotStart || !name || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please provide your name, a valid email, and pick a slot." },
        { status: 400 }
      );
    }

    // Create the pending hold. The DB partial-unique index makes a taken slot fail.
    let booking;
    try {
      booking = await createPendingBooking({
        blockId,
        slotStart,
        name,
        email,
        phone,
        selfLevel,
        availability,
      });
    } catch (err) {
      if (err instanceof SlotTakenError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";
    const successUrl = `${origin}/assessment/booked?booking=${booking.id}`;
    const cancelUrl = `${origin}/assessment/book`;

    const priceCents = assessmentPriceCents();
    // Free-mode ($0) or mock-mode (no Stripe key): skip payment, confirm now.
    if (priceCents === 0 || isMockMode) {
      await confirmBooking(booking.id);
      return NextResponse.json({ url: successUrl });
    }

    const { sessionUrl, stripeSessionId } = await createAssessmentCheckoutSession({
      bookingId: booking.id,
      priceCents,
      successUrl,
      cancelUrl,
      contactEmail: email,
    });

    if (stripeSessionId) {
      const supabase = createServiceClient();
      await supabase
        .from("assessment_bookings")
        .update({ stripe_session_id: stripeSessionId })
        .eq("id", booking.id);
    }

    return NextResponse.json({ url: sessionUrl });
  } catch (err) {
    console.error("Assessment booking error:", err);
    return NextResponse.json(
      { error: "Could not create your booking. Please try again." },
      { status: 500 }
    );
  }
}

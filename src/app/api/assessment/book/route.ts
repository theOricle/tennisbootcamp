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
import {
  currentUser,
  resolveSubmissionParticipant,
  type ParticipantInput,
} from "@/lib/household";
import {
  bodyTooLarge,
  checkBot,
  cleanText,
  isValidEmail,
  logBotDrop,
  REQUEST_TOO_LARGE,
  TEXT_LIMITS,
} from "@/lib/botCheck";

function siteOrigin(req: NextRequest): string {
  return (
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://tennisbootcamp-seven.vercel.app"
  );
}

function assessmentPriceCents(): number {
  const raw = process.env.ASSESSMENT_PRICE_CENTS;
  const n = raw == null || raw === "" ? 2000 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

export async function POST(req: NextRequest) {
  try {
    // Bot protection (backlog #25): size cap, then the bot check before any
    // participant lookup, booking row, Stripe session or email. A tripped
    // check gets the same response a real booking gets.
    const raw = await req.text();
    if (bodyTooLarge(raw, req.headers.get("content-length"))) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    const body = JSON.parse(raw);
    const verdict = checkBot(body);
    if (verdict.bot) {
      logBotDrop("assessment/book", verdict.reason);
      return body?.mode === "request"
        ? NextResponse.json({ requested: true })
        : NextResponse.json({ url: `${siteOrigin(req)}/assessment/book` });
    }

    const blockId = String(body.blockId ?? "").trim().slice(0, TEXT_LIMITS.short);
    const slotStart = String(body.slotStart ?? "").trim().slice(0, TEXT_LIMITS.short);
    const name = String(body.name ?? "").trim().slice(0, TEXT_LIMITS.name);
    const email = String(body.email ?? "").trim().slice(0, TEXT_LIMITS.email);
    const phone = body.phone ? String(body.phone).trim().slice(0, TEXT_LIMITS.phone) : null;
    const selfLevel = body.selfLevel
      ? String(body.selfLevel).trim().slice(0, TEXT_LIMITS.short)
      : null;
    if (body.participant && typeof body.participant === "object") {
      const p = body.participant as Record<string, unknown>;
      body.participant = {
        ...p,
        name: cleanText(p.name, TEXT_LIMITS.name),
        relationship: cleanText(p.relationship, TEXT_LIMITS.short),
        ageBand: cleanText(p.ageBand, TEXT_LIMITS.short),
        selfLevel: cleanText(p.selfLevel, TEXT_LIMITS.short),
      };
    }
    const availability = body.availability
      ? parseAvailability(body.availability)
      : null;

    // Who is this for? A signed-in holder picks one of their people; a guest
    // types a person in. Either way one booking is one participant, one slot,
    // one $20 — two children are two bookings under one payer.
    const signedIn = await currentUser();
    const who = await resolveSubmissionParticipant({
      signedInUserId: signedIn?.id ?? null,
      participantId: body.participantId,
      participant: (body.participant ?? null) as ParticipantInput | null,
      holderName: name || signedIn?.email || "",
      holderEmail: signedIn?.email || email,
      holderPhone: phone,
    });
    const holderEmail = who.accountEmail || email;
    const playerName = who.participantName || name;
    const playerSelfLevel = who.selfLevel ?? selfLevel;

    // Request mode (Phase 2.6): no slot, no payment — the admin coordinates the
    // time directly. Creates a `requested` booking and fires both emails.
    if (body.mode === "request") {
      if (!playerName || !isValidEmail(holderEmail)) {
        return NextResponse.json(
          { error: "Please provide your name and a valid email." },
          { status: 400 }
        );
      }
      await createRequestedBooking({
        name: playerName,
        email: holderEmail,
        phone,
        selfLevel: playerSelfLevel,
        availability,
        requestNote: body.note ? String(body.note).trim().slice(0, TEXT_LIMITS.note) : null,
        userId: who.accountId,
        participantId: who.participantId,
        accountName: who.accountName,
      });
      return NextResponse.json({ requested: true });
    }

    if (!blockId || !slotStart || !playerName || !isValidEmail(holderEmail)) {
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
        name: playerName,
        email: holderEmail,
        phone,
        selfLevel: playerSelfLevel,
        availability,
        userId: who.accountId,
        participantId: who.participantId,
      });
    } catch (err) {
      if (err instanceof SlotTakenError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    const origin = siteOrigin(req);
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
      contactEmail: holderEmail,
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

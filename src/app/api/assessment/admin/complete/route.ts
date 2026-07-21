import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { completeBooking, markNoShow } from "@/lib/assessments";

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const bookingId = String(body.bookingId ?? "").trim();
    const action = String(body.action ?? "complete");
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId." }, { status: 400 });
    }

    if (action === "no_show") {
      const result = await markNoShow(bookingId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    const level = Number(body.level);
    const coachNotes = String(body.coachNotes ?? "").trim();
    if (!Number.isFinite(level) || level < 1 || level > 7) {
      return NextResponse.json(
        { error: "Pick a level between 1.0 and 7.0." },
        { status: 400 }
      );
    }
    if (coachNotes.length < 3) {
      return NextResponse.json(
        { error: "Add a short coach note (2–3 sentences)." },
        { status: 400 }
      );
    }

    const result = await completeBooking(bookingId, { level, coachNotes });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Complete booking error:", err);
    return NextResponse.json({ error: "Failed to complete booking." }, { status: 500 });
  }
}

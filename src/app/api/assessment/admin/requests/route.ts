import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import {
  listRequestedBookings,
  assignRequestedBooking,
  scheduleRequestedBooking,
  setBookingPaid,
} from "@/lib/assessments";
import { availabilityChips } from "@/lib/availability";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await listRequestedBookings();
  const requests = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    self_level: r.self_level,
    availability_chips: availabilityChips(r.availability),
    request_note: r.request_note,
    paid: r.paid,
    created_at: r.created_at,
  }));
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const bookingId = String(body.bookingId ?? "").trim();
    const action = String(body.action ?? "");
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId." }, { status: 400 });
    }

    if (action === "assign") {
      const blockId = String(body.blockId ?? "").trim();
      const slotStart = String(body.slotStart ?? "").trim();
      if (!blockId || !slotStart) {
        return NextResponse.json(
          { error: "Pick an open slot to assign." },
          { status: 400 }
        );
      }
      const result = await assignRequestedBooking(bookingId, { blockId, slotStart });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "schedule") {
      const date = String(body.date ?? "").trim();
      const time = String(body.time ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return NextResponse.json(
          { error: "Enter the coordinated date and time." },
          { status: 400 }
        );
      }
      const result = await scheduleRequestedBooking(bookingId, { date, time });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "set_paid") {
      const result = await setBookingPaid(bookingId, Boolean(body.paid));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("Assessment request admin error:", err);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
}

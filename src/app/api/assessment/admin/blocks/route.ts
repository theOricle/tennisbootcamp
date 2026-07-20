import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { listBlocks, createBlock } from "@/lib/assessments";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocks = await listBlocks();
  return NextResponse.json({ blocks });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const blockDate = String(body.blockDate ?? "").trim();
    const startTime = String(body.startTime ?? "").trim();
    const endTime = String(body.endTime ?? "").trim();
    if (!blockDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Date, start time, and end time are required." },
        { status: 400 }
      );
    }
    if (endTime <= startTime) {
      return NextResponse.json(
        { error: "End time must be after start time." },
        { status: 400 }
      );
    }

    const result = await createBlock({
      blockDate,
      startTime,
      endTime,
      slotMinutes: body.slotMinutes ? Number(body.slotMinutes) : 20,
      locationLabel: body.locationLabel ? String(body.locationLabel).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      createdBy: admin.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Create block error:", err);
    return NextResponse.json({ error: "Failed to create block." }, { status: 500 });
  }
}

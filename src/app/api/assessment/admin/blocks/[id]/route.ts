import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { updateBlock } from "@/lib/assessments";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const body = await req.json();
    if (
      body.startTime != null &&
      body.endTime != null &&
      String(body.endTime) <= String(body.startTime)
    ) {
      return NextResponse.json(
        { error: "End time must be after start time." },
        { status: 400 }
      );
    }
    const result = await updateBlock(id, {
      blockDate: body.blockDate != null ? String(body.blockDate) : undefined,
      startTime: body.startTime != null ? String(body.startTime) : undefined,
      endTime: body.endTime != null ? String(body.endTime) : undefined,
      slotMinutes: body.slotMinutes != null ? Number(body.slotMinutes) : undefined,
      locationLabel:
        body.locationLabel !== undefined
          ? body.locationLabel
            ? String(body.locationLabel).trim()
            : null
          : undefined,
      notes:
        body.notes !== undefined
          ? body.notes
            ? String(body.notes).trim()
            : null
          : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update block error:", err);
    return NextResponse.json({ error: "Failed to update block." }, { status: 500 });
  }
}

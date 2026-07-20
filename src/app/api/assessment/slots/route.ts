import { NextResponse } from "next/server";
import { getUpcomingSlots } from "@/lib/assessments";

// Public read. Sweeps expired pendings on every call (via getUpcomingSlots) so a
// stale hold never keeps a slot dark.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const blocks = await getUpcomingSlots();
    return NextResponse.json({ blocks });
  } catch (err) {
    console.error("Assessment slots error:", err);
    return NextResponse.json(
      { error: "Failed to load slots.", blocks: [] },
      { status: 500 }
    );
  }
}

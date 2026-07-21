import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { listBookings } from "@/lib/assessments";

export async function GET(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const bookings = await listBookings({ date });
  return NextResponse.json({ bookings });
}

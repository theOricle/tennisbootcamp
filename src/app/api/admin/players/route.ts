import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { availabilityChips, parseAvailability } from "@/lib/availability";

// Admin player pool: profiles with a coach-assigned level (plus emails from
// auth.users). Coach corrections — level, note, availability — post back here.

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  level: string | number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: unknown;
};

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, level, level_assessed_at, level_notes, availability")
      .not("level", "is", null)
      .order("level_assessed_at", { ascending: false, nullsFirst: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Small project — one page of users covers everyone (same as assessments).
    const { data: users } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const emailById = new Map(
      (users?.users ?? []).map((u) => [u.id, u.email ?? ""])
    );

    const players = ((data as ProfileRow[]) ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      email: emailById.get(p.id) ?? "",
      phone: p.phone,
      level: p.level != null ? Number(p.level) : null,
      level_assessed_at: p.level_assessed_at,
      level_notes: p.level_notes,
      availability: parseAvailability(p.availability),
      availability_chips: availabilityChips(p.availability),
    }));

    return NextResponse.json({ players });
  } catch (err) {
    console.error("Admin players GET error:", err);
    return NextResponse.json({ error: "Failed to load players." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing player id." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.level !== undefined) {
      const level = Number(body.level);
      if (!Number.isFinite(level) || level < 1 || level > 7) {
        return NextResponse.json(
          { error: "Level must be between 1.0 and 7.0." },
          { status: 400 }
        );
      }
      patch.level = level;
      patch.level_assessed_at = new Date().toISOString();
    }
    if (body.levelNotes !== undefined) patch.level_notes = String(body.levelNotes);
    if (body.availability !== undefined) {
      patch.availability = parseAvailability(body.availability);
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin players POST error:", err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}

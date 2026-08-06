import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { mapRowToCohort, type CohortRow } from "@/lib/cohortsDb";
import { createCohort, type CohortInput } from "@/lib/cohortActions";

// Admin cohort list + create. Reads the database directly (no static fallback):
// the admin edits real rows, so "run migration 0004" surfaces as dbReady: false.

function dbConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!dbConfigured()) {
    return NextResponse.json({ cohorts: [], dbReady: false });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select("*")
      .order("start_date", { ascending: true });
    if (error) {
      // Table missing → migration 0004 not applied yet.
      return NextResponse.json({ cohorts: [], dbReady: false });
    }

    const rows = (data as CohortRow[]) ?? [];
    const ids = rows.map((r) => r.id);
    const paidByCohort = new Map<string, number>();
    if (ids.length > 0) {
      const { data: paid } = await supabase
        .from("cohort_invites")
        .select("cohort_id")
        .in("cohort_id", ids)
        .eq("status", "paid");
      for (const r of paid ?? []) {
        const id = (r as { cohort_id: string }).cohort_id;
        paidByCohort.set(id, (paidByCohort.get(id) ?? 0) + 1);
      }
    }

    const cohorts = rows.map((r) => ({
      ...mapRowToCohort(r),
      paidCount: paidByCohort.get(r.id) ?? 0,
    }));
    return NextResponse.json({ cohorts, dbReady: true });
  } catch (err) {
    console.error("Admin cohorts GET error:", err);
    return NextResponse.json({ cohorts: [], dbReady: false });
  }
}

const VALID_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function parseInput(body: Record<string, unknown>): CohortInput | string {
  const programId = String(body.programId ?? "").trim();
  const label = String(body.label ?? "").trim();
  const startDate = String(body.startDate ?? "").trim();
  const weeks = Number(body.weeks);
  const priceCents = Number(body.priceCents);
  const capacityMin = Number(body.capacityMin);
  const capacityMax = Number(body.capacityMax);

  if (!programId) return "Pick a program.";
  if (!label) return "Give the cohort a label.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "Pick a start date.";
  if (!Number.isInteger(weeks) || weeks < 1) return "Weeks must be at least 1.";
  if (!Number.isFinite(priceCents) || priceCents < 0) return "Enter a price.";
  if (!Number.isInteger(capacityMin) || capacityMin < 1) return "Minimum-to-run must be at least 1.";
  if (!Number.isInteger(capacityMax) || capacityMax < capacityMin) {
    return "Capacity max must be at least the minimum.";
  }

  const sessionsRaw = Array.isArray(body.sessions) ? body.sessions : [];
  const sessions = sessionsRaw
    .map((s) => ({
      day: String((s as Record<string, unknown>).day ?? ""),
      start: String((s as Record<string, unknown>).start ?? ""),
      end: String((s as Record<string, unknown>).end ?? ""),
    }))
    .filter(
      (s) => VALID_DAYS.has(s.day) && /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end)
    );
  if (sessions.length === 0) return "Add at least one weekly session slot.";

  const levelMin = body.levelMin === null || body.levelMin === "" || body.levelMin === undefined
    ? null
    : Number(body.levelMin);
  const levelMax = body.levelMax === null || body.levelMax === "" || body.levelMax === undefined
    ? null
    : Number(body.levelMax);
  if (levelMin !== null && (!Number.isFinite(levelMin) || levelMin < 1 || levelMin > 7)) {
    return "Level min must be between 1.0 and 7.0.";
  }
  if (levelMax !== null && (!Number.isFinite(levelMax) || levelMax < 1 || levelMax > 7)) {
    return "Level max must be between 1.0 and 7.0.";
  }
  if (levelMin !== null && levelMax !== null && levelMin > levelMax) {
    return "Level min can't be above level max.";
  }

  return {
    programId,
    label,
    levelMin,
    levelMax,
    locationLabel: String(body.locationLabel ?? "").trim() || null,
    startDate,
    weeks,
    sessions,
    priceCents,
    capacityMin,
    capacityMax,
    visibility: body.visibility === "public" ? "public" : "private",
    inviteHoldHours: Number.isInteger(Number(body.inviteHoldHours)) && Number(body.inviteHoldHours) > 0
      ? Number(body.inviteHoldHours)
      : 48,
    makeupMaxWeeks: Number.isInteger(Number(body.makeupMaxWeeks)) && Number(body.makeupMaxWeeks) >= 0
      ? Number(body.makeupMaxWeeks)
      : 2,
  };
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const input = parseInput(body);
    if (typeof input === "string") {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const result = await createCohort(input);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    console.error("Admin cohorts POST error:", err);
    return NextResponse.json({ error: "Create failed." }, { status: 500 });
  }
}

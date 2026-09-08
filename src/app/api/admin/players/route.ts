import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { availabilityChips } from "@/lib/availability";
import {
  listPlayers,
  filterPlayersByView,
  sortPlayers,
  setPlayerLevel,
  setPlayerLevelNotes,
  setPlayerAvailability,
  type PlayerView,
  type PlayerSort,
} from "@/lib/players";

// Admin player pool: every account, leveled or not (plus emails from
// auth.users). Coach corrections — level, note, availability — post back here.
//
// GET ?view=all|leveled|unleveled (default all)
//     &sort=level|availability_updated_at (default level)
//     &dir=asc|desc (default desc)

const VIEWS: PlayerView[] = ["all", "leveled", "unleveled"];
const SORTS: PlayerSort[] = ["level", "availability_updated_at"];

export async function GET(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const viewParam = params.get("view") ?? "all";
  const sortParam = params.get("sort") ?? "level";
  const dirParam = params.get("dir") === "asc" ? "asc" : "desc";
  const view: PlayerView = VIEWS.includes(viewParam as PlayerView)
    ? (viewParam as PlayerView)
    : "all";
  const sort: PlayerSort = SORTS.includes(sortParam as PlayerSort)
    ? (sortParam as PlayerSort)
    : "level";

  try {
    const all = await listPlayers();

    // Small project — one page of users covers everyone (same as assessments).
    const supabase = createServiceClient();
    const { data: users } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const emailById = new Map(
      (users?.users ?? []).map((u) => [u.id, u.email ?? ""])
    );

    const players = sortPlayers(filterPlayersByView(all, view), sort, dirParam).map(
      (p) => ({
        id: p.id,
        name: p.full_name,
        email: emailById.get(p.id) ?? "",
        phone: p.phone,
        level: p.level,
        level_assessed_at: p.level_assessed_at,
        level_notes: p.level_notes,
        availability: p.availability,
        availability_chips: availabilityChips(p.availability),
        availability_updated_at: p.availability_updated_at,
        availability_source: p.availability_source,
        availability_note: p.availability_note,
      })
    );

    return NextResponse.json({
      players,
      view,
      sort,
      dir: dirParam,
      counts: {
        all: all.length,
        leveled: filterPlayersByView(all, "leveled").length,
        unleveled: filterPlayersByView(all, "unleveled").length,
      },
    });
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

    if (body.level !== undefined) {
      const level = Number(body.level);
      if (!Number.isFinite(level) || level < 1 || level > 7) {
        return NextResponse.json(
          { error: "Level must be between 1.0 and 7.0." },
          { status: 400 }
        );
      }
      const result = await setPlayerLevel(id, {
        level,
        notes: body.levelNotes !== undefined ? String(body.levelNotes) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    } else if (body.levelNotes !== undefined) {
      const result = await setPlayerLevelNotes(id, String(body.levelNotes));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    if (body.availability !== undefined) {
      // A coach edit is a coach-sourced grid, same provenance as an
      // on-court assessment.
      const result = await setPlayerAvailability(id, {
        availability: body.availability,
        source: "assessment",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin players POST error:", err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}

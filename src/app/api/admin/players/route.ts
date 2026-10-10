import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { availabilityChips } from "@/lib/availability";
import {
  listPlayers,
  listAccounts,
  listPlayerEvidence,
  filterPlayersByView,
  sortPlayers,
  setPlayerLevel,
  setPlayerLevelNotes,
  setPlayerAvailability,
  RELATIONSHIP_LABELS,
  isRelationship,
  type PlayerView,
  type PlayerSort,
  type PlayerRecord,
} from "@/lib/players";
import { holderIsPlayer } from "@/lib/householdView";

// Admin player pool: every participant on every account — the holder
// themselves, their children, a spouse — leveled or not, each carrying the
// account they belong to, their age band and their own self-estimate
// (migration 0009, audit L20). Coach corrections (level, note, availability)
// post back here against the participant id.
//
// An account-only holder — a parent who registered a child and was never
// named as a player themselves (src/lib/householdView.ts, audit M26) — is
// flagged `accountOnly` and kept out of the Unranked queue and its count.
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
    const [everyone, accounts, evidence] = await Promise.all([
      listPlayers(),
      listAccounts(),
      listPlayerEvidence().catch(() => ({
        participantIds: new Set<string>(),
        enrollmentNamesByAccount: new Map<string, string[]>(),
      })),
    ]);

    // Account-only holders: someone else is on the account and nothing names
    // the holder as a player. They stay in "All" (marked), never "Unranked".
    const byAccount = new Map<string, PlayerRecord[]>();
    for (const p of everyone) {
      const list = byAccount.get(p.account_id) ?? [];
      list.push(p);
      byAccount.set(p.account_id, list);
    }
    const accountOnly = new Set<string>();
    for (const [accountId, people] of byAccount) {
      const self = people.find((p) => p.relationship === "self");
      if (!self) continue;
      const plays = holderIsPlayer(self, people, {
        participantIds: evidence.participantIds,
        enrollmentNames: evidence.enrollmentNamesByAccount.get(accountId) ?? [],
      });
      if (!plays) accountOnly.add(self.id);
    }
    const all = everyone.filter((p) => !accountOnly.has(p.id) || view === "all");
    const pool = everyone.filter((p) => !accountOnly.has(p.id));

    const players = sortPlayers(filterPlayersByView(all, view), sort, dirParam).map(
      (p) => {
        const account = accounts.get(p.account_id);
        return {
          id: p.id,
          name: p.full_name,
          relationship: p.relationship,
          relationshipLabel: isRelationship(p.relationship)
            ? RELATIONSHIP_LABELS[p.relationship]
            : "",
          isMinor: p.is_minor,
          // The account this player belongs to — two "Maya Chen"s under
          // different parents are told apart by this.
          account: {
            id: p.account_id,
            name: account?.name ?? null,
            email: account?.email ?? "",
          },
          email: account?.email ?? "",
          phone: account?.phone ?? null,
          // Migration 0009 (audit L20): null before it runs.
          ageBand: p.age_band ?? null,
          selfLevel: p.self_level ?? null,
          accountOnly: accountOnly.has(p.id),
          level: p.level,
          level_assessed_at: p.level_assessed_at,
          level_notes: p.level_notes,
          availability: p.availability,
          availability_chips: availabilityChips(p.availability),
          availability_updated_at: p.availability_updated_at,
          availability_source: p.availability_source,
          availability_note: p.availability_note,
        };
      }
    );

    return NextResponse.json({
      players,
      view,
      sort,
      dir: dirParam,
      counts: {
        all: everyone.length,
        leveled: filterPlayersByView(pool, "leveled").length,
        unleveled: filterPlayersByView(pool, "unleveled").length,
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
    // The id is the participant's — the person, not the account.
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

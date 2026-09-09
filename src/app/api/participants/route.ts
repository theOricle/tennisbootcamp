import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listParticipantsForAccount,
  ensureSelfParticipant,
  createParticipant,
  isRelationship,
} from "@/lib/players";

// The signed-in holder's household: the people they can book, enroll or
// place. GET lists them ('self' first); POST adds one. Session-gated — a
// caller only ever sees or touches their own account_id, and the write goes
// through the service-role client in src/lib/players.ts.

const NAME_MAX = 120;

function accountsConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Only the fields the chooser needs — no coach notes, no provenance. */
function toPublic(p: {
  id: string;
  full_name: string | null;
  relationship: string;
  is_minor: boolean;
  level: number | null;
}) {
  return {
    id: p.id,
    name: p.full_name,
    relationship: p.relationship,
    isMinor: p.is_minor,
    level: p.level,
  };
}

export async function GET() {
  if (!accountsConfigured()) return NextResponse.json({ participants: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ participants: [], signedIn: false });

  try {
    // A brand-new account (or one the 0007 backfill couldn't reach) gets its
    // 'self' participant on first read, so the chooser is never empty.
    await ensureSelfParticipant(user.id, {
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    }).catch(() => null);

    const participants = await listParticipantsForAccount(user.id);
    return NextResponse.json({
      signedIn: true,
      accountEmail: user.email ?? "",
      participants: participants.map(toPublic),
    });
  } catch (err) {
    console.error("Participants GET error:", err);
    return NextResponse.json(
      { error: "Couldn't load who's on your account." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!accountsConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  try {
    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim().slice(0, NAME_MAX);
    if (!fullName) {
      return NextResponse.json({ error: "Enter their full name." }, { status: 400 });
    }
    const relationship = isRelationship(body.relationship) ? body.relationship : "other";

    // No level here on purpose: `participants.level` is the coach-assigned
    // level and drives the leveled/unleveled admin split. A self-estimate
    // rides along with the booking (assessment_bookings.self_level) instead.
    const result = await createParticipant({
      accountId: user.id,
      fullName,
      relationship,
      isMinor: body.isMinor === true,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, participant: toPublic(result.participant) });
  } catch (err) {
    console.error("Participants POST error:", err);
    return NextResponse.json({ error: "Could not add that person." }, { status: 500 });
  }
}

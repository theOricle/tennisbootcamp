import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listParticipantsForAccount,
  ensureSelfParticipant,
  createParticipant,
  isRelationship,
  removeParticipant,
  setParticipantProfile,
  updateParticipantDetails,
} from "@/lib/players";
import { isAgeBand, type AgeBand } from "@/lib/ageBand";
import { PARTICIPANT_CAP_ERROR } from "@/lib/participantInput";

// The signed-in holder's household: the people they can book, enroll or
// place. GET lists them ('self' first); POST adds one; PATCH renames one or
// changes their age band, and DELETE removes one added by mistake (/profile,
// audit M34). Session-gated — a caller only ever sees or touches their own
// account_id, and every write goes through src/lib/players.ts.

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
  age_band?: AgeBand | null;
}) {
  return {
    id: p.id,
    name: p.full_name,
    relationship: p.relationship,
    isMinor: p.is_minor,
    level: p.level,
    // The band they last answered (migration 0009, audit M31) seeds the
    // chooser; null before 0009 or when never asked.
    ageBand: p.age_band ?? null,
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
      // The per-household cap (src/lib/participantInput.ts) is a conflict
      // with the account's state, not a malformed request.
      const status = result.error === PARTICIPANT_CAP_ERROR ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    // Their age band, kept for next time (migration 0009); skipped quietly
    // before it runs.
    if (isAgeBand(body.ageBand)) {
      await setParticipantProfile(result.participant.id, { ageBand: body.ageBand }).catch(() => null);
      result.participant.age_band = body.ageBand;
    }
    return NextResponse.json({ ok: true, participant: toPublic(result.participant) });
  } catch (err) {
    console.error("Participants POST error:", err);
    return NextResponse.json({ error: "Could not add that person." }, { status: 500 });
  }
}

/** The session's account id, or a ready refusal. */
async function sessionAccount(): Promise<{ id: string } | NextResponse> {
  if (!accountsConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 500 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return { id: user.id };
}

// PATCH { id, fullName?, ageBand? } — rename a player on the holder's own
// account, or set a child's age band (audit M34). The holder's own name is
// edited with the profile form, which keeps profile and player in step.
export async function PATCH(req: NextRequest) {
  const account = await sessionAccount();
  if (account instanceof NextResponse) return account;
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Pick the player." }, { status: 400 });
    const result = await updateParticipantDetails(account.id, id, {
      fullName: typeof body.fullName === "string" ? body.fullName.slice(0, NAME_MAX) : undefined,
      ageBand: body.ageBand,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Participants PATCH error:", err);
    return NextResponse.json(
      { error: "Couldn't save that change. Try again or email info@tennisbootcamp.ca." },
      { status: 500 }
    );
  }
}

// DELETE { id } — remove a player added by mistake. Refused (409, with the
// reason) for the holder, a levelled player, or anyone with a booking, an
// invite or an enrollment behind them (src/lib/householdView.ts).
export async function DELETE(req: NextRequest) {
  const account = await sessionAccount();
  if (account instanceof NextResponse) return account;
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Pick the player." }, { status: 400 });
    const result = await removeParticipant(account.id, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Participants DELETE error:", err);
    return NextResponse.json(
      { error: "Couldn't remove that player. Try again or email info@tennisbootcamp.ca." },
      { status: 500 }
    );
  }
}

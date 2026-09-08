import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseAvailability, hasAnyAvailability } from "@/lib/availability";
import { setPlayerAvailability } from "@/lib/players";

// Dashboard "Your availability" editor → the player's own profile.
// Session-gated (the caller can only write their own row); the write itself
// goes through the players helper with the service client so the provenance
// stamp (source = 'dashboard') can't be forged from the browser.

const NOTE_MAX = 140;

export async function POST(req: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  try {
    const body = await req.json();
    const availability = parseAvailability(body.availability);
    if (!hasAnyAvailability(availability)) {
      return NextResponse.json(
        { error: "Tap at least one time you can train, then confirm." },
        { status: 400 }
      );
    }
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, NOTE_MAX) : "";

    const result = await setPlayerAvailability(user.id, {
      availability,
      source: "dashboard",
      note: note || null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Profile availability POST error:", err);
    return NextResponse.json(
      { error: "Couldn't save your availability. Try again or email info@tennisbootcamp.ca." },
      { status: 500 }
    );
  }
}

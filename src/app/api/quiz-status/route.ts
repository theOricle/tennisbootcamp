import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listParticipantsForAccount } from "@/lib/players";
import { accountQuizStatus } from "@/lib/quizStatus";

// Has the signed-in account taken the 2-minute quiz? (owner, 2026-10-12.)
// Read by src/lib/useQuizStatus.ts once per page, only when the session
// cookie says someone is signed in. The rule is accountQuizStatus
// (src/lib/quizStatus.ts) over the account's own players, read with the
// holder's session under RLS. A guest, or an unconfigured Supabase, reads as
// signed out; the device flag then decides in the browser. Never writes.

export const dynamic = "force-dynamic";

function accountsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET() {
  if (!accountsConfigured()) return NextResponse.json({ signedIn: false });
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ signedIn: false });
    const players = await listParticipantsForAccount(user.id, supabase);
    const status = accountQuizStatus(players);
    return NextResponse.json({ signedIn: true, ...status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("Quiz status GET error:", err);
    // The chrome falls back to the ordinary quiz CTA; nothing is lost.
    return NextResponse.json({ signedIn: false });
  }
}

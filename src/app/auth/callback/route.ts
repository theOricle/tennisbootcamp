import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callbackErrorFor, safeNextPath, type CallbackError } from "@/lib/authFlow";
import { linkEnrollmentsToAccount } from "@/lib/supabase/enrollmentActions";
import { linkBookingsToAccount } from "@/lib/assessments";
import { afterSignInPath } from "@/lib/signInCode";
import { readSignInState } from "@/lib/signInState";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  // Audit M20: only a site-relative path is followed after sign-in, never
  // another origin or a page that would send the player round again.
  const next = safeNextPath(searchParams.get("next"));
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "invite"
    | "magiclink"
    | "recovery"
    | "email"
    | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  // A refusal goes to /login as a code; the login page owns the words, and
  // Supabase's own message never reaches the player (audit M20).
  const refuse = (error: CallbackError) =>
    NextResponse.redirect(`${origin}/login?error=${error}`);

  let signedIn = false;
  if (token_hash && type) {
    // token_hash flow: invite links, magic links, password-recovery links.
    // verifyOtp establishes the session via server-side cookies (@supabase/ssr).
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) return refuse(callbackErrorFor(error));
    signedIn = true;
  } else if (code) {
    // PKCE code flow: used by OAuth providers and some Supabase email confirmations.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return refuse("link_failed");
    signedIn = true;
  }

  // The address owner just signed in through their own emailed link
  // (backlog #84): enrollment rows and assessment bookings saved under their
  // address while nobody was signed in become theirs now, with any result the
  // coach recorded meanwhile. Both links re-check that the address is this
  // account's own, and only ever touch unowned rows. Neither holds up or
  // fails the sign-in.
  if (signedIn) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id && user.email) {
        await linkEnrollmentsToAccount(user.id, user.email).catch(() =>
          console.error("Enrollment link at sign-in failed (non-blocking)")
        );
        await linkBookingsToAccount(user.id, user.email).catch(() =>
          console.error("Booking link at sign-in failed (non-blocking)")
        );
      }
    } catch {
      console.error("Link at sign-in skipped: no user read (non-blocking)");
    }
  }

  // Backlog #92: an emailed link is the first step only. An account with an
  // authenticator app (the coach's) owes its 6-digit code before it goes on,
  // so the session goes to the code page, which keeps `next`. An account with
  // no factor goes straight through, as before. A level that cannot be read
  // never holds up the sign-in: every admin page and API checks it again.
  let destination = next;
  if (signedIn) {
    try {
      const state = await readSignInState(supabase);
      if (state) {
        destination = afterSignInPath(
          { currentLevel: state.aal, nextLevel: state.totpFactorId ? "aal2" : "aal1" },
          next
        );
      }
    } catch {
      console.error("Sign-in level not read at the callback (non-blocking)");
    }
  }

  return NextResponse.redirect(`${origin}${destination}`);
}

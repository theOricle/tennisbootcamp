import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callbackErrorFor, safeNextPath, type CallbackError } from "@/lib/authFlow";

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

  if (token_hash && type) {
    // token_hash flow: invite links, magic links, password-recovery links.
    // verifyOtp establishes the session via server-side cookies (@supabase/ssr).
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) return refuse(callbackErrorFor(error));
  } else if (code) {
    // PKCE code flow: used by OAuth providers and some Supabase email confirmations.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return refuse("link_failed");
  }

  return NextResponse.redirect(`${origin}${next}`);
}

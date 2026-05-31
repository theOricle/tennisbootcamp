import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "invite"
    | "magiclink"
    | "recovery"
    | "email"
    | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (token_hash && type) {
    // token_hash flow: invite links, magic links, password-recovery links.
    // verifyOtp establishes the session via server-side cookies (@supabase/ssr).
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }
  } else if (code) {
    // PKCE code flow: used by OAuth providers and some Supabase email confirmations.
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

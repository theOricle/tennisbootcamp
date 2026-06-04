import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendLinkEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.warn("[reset-password] Supabase not configured — cannot send reset link.");
    // Return success so we don't leak whether an account exists.
    return NextResponse.json({ ok: true });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = createServiceClient();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
  });

  if (error || !data.properties?.hashed_token) {
    console.error("[reset-password] generateLink error:", error?.message);
    // Still return 200 — don't leak account existence.
    return NextResponse.json({ ok: true });
  }

  const recoveryUrl =
    `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=/set-password`;

  await sendLinkEmail(
    email,
    "Reset your Tennis Bootcamp password",
    recoveryUrl,
    "reset your password"
  );

  return NextResponse.json({ ok: true });
}

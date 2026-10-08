import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendLinkEmail } from "@/lib/email";
import { bodyTooLarge, logBotDrop, REQUEST_TOO_LARGE } from "@/lib/botCheck";
import { decideReset, RESET_LOG_ROUTE, RESET_RESPONSE } from "@/lib/resetGuard";

export async function POST(req: NextRequest) {
  // Bot protection (backlog #29): size cap, then the bot check before anything
  // else. A tripped check gets the same response as a real request, so a bot
  // learns nothing and no email is sent.
  const raw = await req.text();
  if (bodyTooLarge(raw, req.headers.get("content-length"))) {
    return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const decision = decideReset(parsed);
  if (decision.action === "drop") {
    logBotDrop(RESET_LOG_ROUTE, decision.reason);
    return NextResponse.json(RESET_RESPONSE);
  }
  if (decision.action === "reject") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  const { email } = decision;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.warn("[reset-password] Supabase not configured — cannot send reset link.");
    // Return success so we don't leak whether an account exists.
    return NextResponse.json(RESET_RESPONSE);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tennisbootcamp-seven.vercel.app";
  const supabase = createServiceClient();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
  });

  if (error || !data.properties?.hashed_token) {
    // Supabase's message names the address for an unknown user; log the
    // status only, never the message.
    console.error("[reset-password] generateLink failed (status", error?.status ?? "n/a", ")");
    // Still return 200 — don't leak account existence.
    return NextResponse.json(RESET_RESPONSE);
  }

  const recoveryUrl =
    `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=/set-password`;

  // Non-blocking, and deliberately so: this route answers 200 on every path
  // above so it never reveals whether an account exists. Letting a Resend
  // refusal throw would 500 only for addresses that got this far — an
  // account-existence oracle — so the failure is logged, not propagated.
  // The error object is not logged either: Resend echoes the recipient.
  await sendLinkEmail(
    email,
    "Reset your Tennis Bootcamp password",
    recoveryUrl,
    "reset your password"
  ).catch((err: unknown) =>
    console.error(
      "[reset-password] reset email failed (non-blocking):",
      err instanceof Error ? err.name : typeof err
    )
  );

  return NextResponse.json(RESET_RESPONSE);
}

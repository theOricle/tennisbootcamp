import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendLinkEmail } from "@/lib/email";
import { bodyTooLarge, logBotDrop, REQUEST_TOO_LARGE } from "@/lib/botCheck";
import {
  decideReset,
  findUserByEmail,
  RESET_LOG_ROUTE,
  RESET_RESPONSE,
  withinResetCooldown,
} from "@/lib/resetGuard";

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

  // Timing side channel (backlog #36): the response goes out *now*, before the
  // address is looked up or anything is sent. The lookup, generateLink and the
  // Resend send run after the response in Next's after(), so a known and an
  // unknown address answer in comparable time. Nothing in there can change
  // the response, and nothing in there throws out of this handler.
  after(() => sendRecovery(email, siteUrl));

  return NextResponse.json(RESET_RESPONSE);
}

/**
 * The post-response work. Every failure is logged without the address or an
 * upstream message (Supabase and Resend both echo the recipient) and swallowed.
 */
async function sendRecovery(email: string, siteUrl: string): Promise<void> {
  try {
    const supabase = createServiceClient();

    // Per-address cooldown (backlog #36): Supabase stamps recovery_sent_at
    // when a recovery link is generated. Inside RESET_COOLDOWN_MS of that
    // stamp, stay quiet. Only a *found* user inside the window skips the
    // send — a lookup error or no match falls through to generateLink, which
    // keeps a real reset from being lost to the lookup (and matches the
    // one-page convention of findUserIdByEmail in src/lib/players.ts).
    const list = await supabase.auth.admin
      .listUsers({ page: 1, perPage: 200 })
      .catch(() => null);
    if (list?.error) {
      console.error("[reset-password] listUsers failed (status", list.error.status ?? "n/a", ")");
    }
    const user = list?.data?.users ? findUserByEmail(list.data.users, email) : undefined;
    if (user && withinResetCooldown(user.recovery_sent_at)) {
      console.warn("[reset-password] inside cooldown — no link sent");
      return;
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
    });

    if (error || !data.properties?.hashed_token) {
      // Supabase's message names the address for an unknown user; log the
      // status only, never the message.
      console.error("[reset-password] generateLink failed (status", error?.status ?? "n/a", ")");
      return;
    }

    const recoveryUrl =
      `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=/set-password`;

    await sendLinkEmail(
      email,
      "Reset your Tennis Bootcamp password",
      recoveryUrl,
      "reset your password"
    );
  } catch (err: unknown) {
    // The error object is not logged: Resend echoes the recipient.
    console.error(
      "[reset-password] post-response work failed:",
      err instanceof Error ? err.name : typeof err
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { currentUser } from "@/lib/household";
import { listParticipantsForAccount } from "@/lib/players";
import { accountCreditView } from "@/lib/assessmentCredit";
import { sendLinkEmail } from "@/lib/email";
import { safeNextPath } from "@/lib/authFlow";
import { bodyTooLarge, REQUEST_TOO_LARGE } from "@/lib/botCheck";
import {
  SIGN_IN_LINK_FAILED,
  SIGN_IN_LINK_SUBJECT,
  recordSignInLink,
  signInLinkAllowed,
} from "@/lib/signInLink";

// The sign-in link behind "Email me the sign-in link" (backlog #84, safety
// review). A signed-in account whose paid assessment was booked under its
// address while nobody was signed in asks for it; opening the link proves the
// mailbox, and /auth/callback then links the booking, so its $20 applies.
//
// What keeps it narrow:
//   - only a signed-in session may ask, and the link goes to that account's
//     own address as Supabase holds it: the request names no address;
//   - it is sent only while such a credit waits, at most once a minute and
//     five times a day (src/lib/signInLink.ts);
//   - where the link lands is a site-relative path, checked here and again
//     by the callback.

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (bodyTooLarge(raw, req.headers.get("content-length"))) {
    return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
  }
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let next = safeNextPath(null);
  try {
    const body = JSON.parse(raw) as { next?: unknown } | null;
    next = safeNextPath(typeof body?.next === "string" ? body.next : null);
  } catch {
    // No readable body: the link lands on the dashboard.
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true });
  }

  try {
    // Only while a credit waits: this is never a general way to send email.
    const players = await listParticipantsForAccount(user.id).catch(() => []);
    const view = await accountCreditView({
      accountId: user.id,
      email: user.email,
      participantIds: players.map((p) => p.id),
    });
    if (view.waiting.length === 0) return NextResponse.json({ ok: true });

    const supabase = createServiceClient();
    const { data } = await supabase.auth.admin.getUserById(user.id);
    const account = data?.user;
    if (!account?.email) return NextResponse.json({ ok: true });
    const now = Date.now();
    const meta = (account.user_metadata ?? {}) as Record<string, unknown>;
    // Inside the minute or over the day's cap: the earlier link is in the
    // inbox already, so the answer is the same and nothing more is sent.
    if (!signInLinkAllowed(meta, now)) return NextResponse.json({ ok: true });
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...meta, ...recordSignInLink(meta, now) },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tennisbootcamp-seven.vercel.app";
    const landing = encodeURIComponent(next);
    const { data: link, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: account.email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=${landing}` },
    });
    if (error || !link.properties?.hashed_token) {
      console.error("[sign-in-link] generateLink failed (status", error?.status ?? "n/a", ")");
      return NextResponse.json({ error: SIGN_IN_LINK_FAILED }, { status: 502 });
    }
    await sendLinkEmail(
      account.email,
      SIGN_IN_LINK_SUBJECT,
      `${siteUrl}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${landing}`,
      "sign in"
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    // The error object is not logged: Resend echoes the recipient.
    console.error("[sign-in-link] failed:", err instanceof Error ? err.name : typeof err);
    return NextResponse.json({ error: SIGN_IN_LINK_FAILED }, { status: 502 });
  }
}

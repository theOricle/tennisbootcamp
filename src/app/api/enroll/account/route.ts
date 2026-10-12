import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { currentUser } from "@/lib/household";
import { ensureSelfParticipant, fillPlayerContact, findUserIdByEmail } from "@/lib/players";
import { isValidEmail, newPasswordError } from "@/lib/formValidation";
import { bodyTooLarge, REQUEST_TOO_LARGE } from "@/lib/botCheck";

// "Create your account now" inside a guest enrollment (owner, 2026-10-12:
// "or while enrolling"). The wizard posts the holder's email and the password
// they typed; nothing else in the flow ever sees the password, and it goes
// nowhere but Supabase.
//
// Nobody has proved the address at this point, so the account is created
// UNCONFIRMED (`email_confirm: false`, as every other create in the repo:
// players.ts ensureAccountForEmail) and the wizard carries on as a guest —
// it never signs in here. The enrollment's own set-up email then goes to the
// address (notifyEnrollmentAccount: the account was never confirmed and never
// signed in, so accountNeedsSetup is true); its link confirms the address,
// and from then on the typed password works. A stranger who types someone
// else's email gets an account they cannot sign in to, and the real owner's
// set-up link lands on /set-password, where they set their own.
//
// The answer is the same whether the account was created or the address
// already had one, and the wizard shows the same note either way: nothing
// here says whether an address has an account.

const NAME_MAX = 120;
const PHONE_MAX = 40;

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (bodyTooLarge(raw, req.headers.get("content-length"))) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!supabaseConfigured()) {
      return NextResponse.json({ error: "Accounts are not configured." }, { status: 500 });
    }
    if (await currentUser()) {
      return NextResponse.json({ error: "You're already signed in." }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, NAME_MAX) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, PHONE_MAX) : "";
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Check your email address." }, { status: 400 });
    }
    const pwError = newPasswordError(password);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    // An address that already has an account keeps it, password and all:
    // nothing is created or changed, and the wizard's sign-in decides.
    const existing = await findUserIdByEmail(email).catch(() => null);
    if (existing) return NextResponse.json({ ok: true });

    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      // Unproven address: the enrollment's set-up link confirms it. Never true.
      email_confirm: false,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (error || !data.user?.id) {
      // A race with another writer (the address exists after all) reads the
      // same as an existing account; anything else is logged without the
      // address and the wizard falls back to the set-up email.
      if (error && /already|exists|registered/i.test(error.message)) {
        return NextResponse.json({ ok: true });
      }
      console.error("Guest account creation failed:", error?.message ?? "no user");
      return NextResponse.json(
        { error: "We couldn't create your account just now." },
        { status: 500 }
      );
    }
    const userId = data.user.id;
    // The holder's name and phone, and their own player row, so the
    // enrollment rows (saved next, under this session) attach to a person.
    await fillPlayerContact(userId, { fullName: fullName || null, phone: phone || null }).catch(
      () => undefined
    );
    await ensureSelfParticipant(userId, { fullName: fullName || null }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Guest account route error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We couldn't create your account just now." }, { status: 500 });
  }
}

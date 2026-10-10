import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateHolderContact } from "@/lib/players";
import { phoneError } from "@/lib/formValidation";

// /profile's "Save changes" (audit M34): the holder's name and phone. Written
// through src/lib/players.ts so the profile and the holder's own player row
// keep one name — the dashboard greets from the player row, and used to keep
// an old name after an edit. Session-gated: only the caller's own account.

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
    const fullName = typeof body.fullName === "string" ? body.fullName : "";
    const phone = typeof body.phone === "string" ? body.phone : "";
    const problem = phoneError(phone, { required: false });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const result = await updateHolderContact(user.id, { fullName, phone });
    if (!result.ok) {
      console.error("Profile save failed:", result.error);
      return NextResponse.json(
        { error: "Your changes weren't saved. Try again or email info@tennisbootcamp.ca." },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Profile POST error:", err);
    return NextResponse.json(
      { error: "Your changes weren't saved. Try again or email info@tennisbootcamp.ca." },
      { status: 500 }
    );
  }
}

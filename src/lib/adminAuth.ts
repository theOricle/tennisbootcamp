import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { adminGate, adminRefusedHref, type AdminGate } from "@/lib/signInCode";
import { readSignInState } from "@/lib/signInState";

export type AdminUser = { id: string; email: string };

export type AdminGateResult =
  | { gate: "signed_out"; user: null }
  | { gate: AdminGate; user: AdminUser };

/**
 * The one gate behind every admin page and admin API (backlog #92). It reads
 * the session from verified sources (src/lib/signInState.ts), looks up
 * profiles.role with the service-role client (bypasses RLS, so it works from
 * API routes too), and hands both to the pure decision in
 * src/lib/signInCode.ts: an admin counts only on a session that has passed
 * the authenticator-app code (AAL2).
 */
async function resolveAdminGate(): Promise<AdminGateResult> {
  const state = await readSignInState();
  if (!state) return { gate: "signed_out", user: null };

  // No service key → the role cannot be confirmed → nobody is an admin.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { gate: "refused", user: state.user };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", state.user.id)
    .maybeSingle();

  const gate = adminGate({
    role: (profile as { role?: string } | null)?.role,
    aal: state.aal,
    hasVerifiedTotp: state.totpFactorId !== null,
  });
  return { gate, user: state.user };
}

/**
 * The gate's answer for this request, for a page that needs to know why
 * (the set-up page). A session that could not be read is signed out.
 */
export async function readAdminGate(): Promise<AdminGateResult> {
  try {
    return await resolveAdminGate();
  } catch {
    return { gate: "signed_out", user: null };
  }
}

/**
 * Where a refused /admin request goes (audit L21; backlog #92): a signed-out
 * visitor to /login with the page remembered in `?next=`, so a deep link
 * survives the sign-in; an admin whose session still owes its code to the
 * code page, and one with no authenticator app yet to the set-up page, both
 * with the same `?next=`; a signed-in non-admin to the dashboard, never back
 * to a sign-in they have already done.
 */
export async function adminRefusedRedirect(path: string): Promise<string> {
  const { gate } = await readAdminGate();
  return adminRefusedHref(gate, path);
}

/**
 * Resolve the current session and confirm it is an admin's, on a session that
 * has passed the sign-in code. Returns null for everyone else: anonymous, a
 * non-admin, an admin who has not set the code up, and an admin whose session
 * has not entered it. Every admin API refuses on null, so none of them needs
 * to know why.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  // No auth backend configured → nobody is an admin (lock out, don't crash).
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  try {
    const { gate, user } = await resolveAdminGate();
    return gate === "ok" ? user : null;
  } catch (err) {
    console.error("getAdminUser failed:", err);
    return null;
  }
}

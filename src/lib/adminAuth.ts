import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AFTER_LOGIN_DEFAULT, loginHref } from "@/lib/authFlow";

export type AdminUser = { id: string; email: string };

/**
 * Where a refused /admin request goes (audit L21): a signed-out visitor to
 * /login with the page remembered in `?next=`, so a deep link survives the
 * sign-in; a signed-in non-admin to the dashboard — never back to a sign-in
 * they have already done.
 */
export async function adminRefusedRedirect(path: string): Promise<string> {
  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return AFTER_LOGIN_DEFAULT;
    }
  } catch {
    // No session could be read: treat as signed out.
  }
  return loginHref(path);
}

/**
 * Resolve the current session and confirm profiles.role = 'admin'.
 * Returns null for anonymous or non-admin callers. The role check uses the
 * service-role client (bypasses RLS) so it works from API routes too.
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || (profile as { role?: string }).role !== "admin") return null;
    return { id: user.id, email: user.email ?? "" };
  } catch (err) {
    console.error("getAdminUser failed:", err);
    return null;
  }
}

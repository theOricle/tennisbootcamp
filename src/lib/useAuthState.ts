"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Signed-in state for the site chrome (header, mobile quiz bar). With
 * `withRole`, also reads the signed-in user's own profiles.role (RLS lets a
 * user read only their own row) so the header can show an Admin link
 * (audit L21). Cosmetic only: every /admin page and route checks the role
 * on the server (src/lib/adminAuth.ts).
 */
export function useAuthState({ withRole = false }: { withRole?: boolean } = {}) {
  const [userId, setUserId] = useState<string | null>(null);
  // The role read for one user id; a stale answer for another id never counts.
  const [roleOf, setRoleOf] = useState<{ userId: string; admin: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!withRole || !userId) return;
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setRoleOf({ userId, admin: (data as { role?: string } | null)?.role === "admin" });
      });
    return () => {
      cancelled = true;
    };
  }, [withRole, userId]);

  const isAdmin = withRole && userId !== null && roleOf?.userId === userId && roleOf.admin;
  return { signedIn: userId !== null, isAdmin };
}

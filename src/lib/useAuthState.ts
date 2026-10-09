"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { hasAuthCookie } from "@/lib/authCookie";

/**
 * Signed-in state for the site chrome (header, mobile quiz bar).
 *
 * The Supabase SDK is off the critical path (audit M40): the header reads the
 * session cookie first, so a signed-out visitor never downloads the SDK and a
 * signed-in one sees Dashboard from the first client render instead of a
 * "Sign in" flash. Only when the cookie is there is the SDK imported, to
 * confirm the session (an expired or revoked cookie flips back to signed
 * out) and, with `withRole`, to read the user's own profiles.role so the
 * header can show an Admin link (audit L21). Cosmetic only: every /admin page
 * and route checks the role on the server (src/lib/adminAuth.ts).
 */

function subscribe(onChange: () => void) {
  // A sign-in or sign-out in another tab, or a return to this one.
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** Read on every render, so a client-side navigation after sign-in sees the new cookie. */
function cookieSnapshot(): boolean {
  return hasAuthCookie(document.cookie);
}

function serverSnapshot(): boolean {
  return false;
}

type Verified = { userId: string | null; admin: boolean };

export function useAuthState({ withRole = false }: { withRole?: boolean } = {}) {
  const hasCookie = useSyncExternalStore(subscribe, cookieSnapshot, serverSnapshot);
  // What the SDK said, once it has been asked. Undefined until then.
  const [verified, setVerified] = useState<Verified | undefined>(undefined);

  useEffect(() => {
    if (!hasCookie) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void import("@/lib/supabase/browser").then(async ({ createClient }) => {
      if (cancelled) return;
      const supabase = createClient();

      async function check(userId: string | null) {
        let admin = false;
        if (withRole && userId) {
          const { data } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();
          admin = (data as { role?: string } | null)?.role === "admin";
        }
        if (!cancelled) setVerified({ userId, admin });
      }

      const { data } = await supabase.auth.getSession();
      await check(data.session?.user.id ?? null);
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        void check(session?.user.id ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
      if (cancelled) unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hasCookie, withRole]);

  // Optimistic from the cookie until the SDK answers; no cookie, no session.
  const signedIn = hasCookie && (verified === undefined || verified.userId !== null);
  const isAdmin = withRole && signedIn && verified?.admin === true;
  return { signedIn, isAdmin };
}

/** Sign out, loading the SDK only now. Lands on the home page. */
export async function signOut(): Promise<void> {
  const { createClient } = await import("@/lib/supabase/browser");
  await createClient().auth.signOut();
  window.location.href = "/";
}

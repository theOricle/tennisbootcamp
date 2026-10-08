import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  enrollSuccessCohortId,
  INVITE_RESUME_COOKIE,
  inviteResumeClearCookie,
} from "@/lib/checkoutInvite";

/**
 * Backlog #34: a successful Stripe checkout lands on
 * /enroll/<cohortId>/confirmed, and the cancel-return cookie the checkout
 * route set (#30) has nothing left to do there. Pages can't set cookies, so
 * it is expired here, on that one path, with the same attributes it was set
 * with. Every other request passes through untouched.
 */
function clearInviteResumeCookie(request: NextRequest, response: NextResponse) {
  const cohortId = enrollSuccessCohortId(request.nextUrl.pathname);
  if (!cohortId || !request.cookies.has(INVITE_RESUME_COOKIE)) return response;
  response.cookies.set(
    inviteResumeClearCookie(cohortId, {
      secure: process.env.NODE_ENV === "production",
    })
  );
  return response;
}

export async function middleware(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.warn(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — skipping session refresh."
    );
    return clearInviteResumeCookie(request, NextResponse.next());
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session, but never let a slow/paused Supabase take the site
  // down: MIDDLEWARE_INVOCATION_TIMEOUT 504s every page when this hangs.
  // Fail open — worst case a stale session refreshes on the next request.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("supabase auth timeout")), 3000)
      ),
    ]);
  } catch (err) {
    console.warn(
      "[middleware] session refresh skipped:",
      err instanceof Error ? err.message : err
    );
  }

  return clearInviteResumeCookie(request, supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

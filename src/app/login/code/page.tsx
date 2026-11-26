import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { loginHref, safeNextPath } from "@/lib/authFlow";
import { needsCodeStep } from "@/lib/signInCode";
import { readSignInState } from "@/lib/signInState";
import { CodeForm } from "@/components/auth/CodeForm";

export const metadata: Metadata = {
  title: "Sign-in code",
  description: "Enter the 6-digit code from your authenticator app.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The code page (backlog #92), for a signed-in session that still owes its
 * code: the account holds a confirmed authenticator-app factor and the
 * session has not passed it. Everyone else is sent on: signed out to /login,
 * and a session with nothing to enter (no factor, or the code already given)
 * straight to where it was going.
 */
export default async function SignInCodePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  const state = await readSignInState().catch(() => null);
  if (!state) redirect(loginHref(next));

  const owesCode = needsCodeStep({
    currentLevel: state.aal,
    nextLevel: state.totpFactorId ? "aal2" : "aal1",
  });
  if (!owesCode || !state.totpFactorId) redirect(next);

  return <CodeForm factorId={state.totpFactorId} nextPath={next} />;
}

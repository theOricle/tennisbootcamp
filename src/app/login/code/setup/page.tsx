import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readAdminGate } from "@/lib/adminAuth";
import { adminRefusedHref, setupNextPath } from "@/lib/signInCode";
import { SetupForm } from "@/components/auth/SetupForm";

export const metadata: Metadata = {
  title: "Set up your sign-in code",
  description: "Pair an authenticator app with your Tennis Bootcamp sign-in.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The one-time set-up (backlog #92): only for a signed-in admin with no
 * confirmed authenticator app. The gate behind every admin page decides: an
 * admin who is already through goes on to `next`; a signed-out visitor to
 * /login; an admin who owes a code to the code page; anyone else to the
 * dashboard. Only "needs set-up" stays on this page.
 */
export default async function SignInCodeSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = setupNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  const { gate } = await readAdminGate();
  if (gate === "ok") redirect(next);
  if (gate !== "needs_setup") redirect(adminRefusedHref(gate, next));

  return <SetupForm nextPath={next} />;
}

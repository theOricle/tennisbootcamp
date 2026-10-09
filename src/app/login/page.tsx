"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/analytics";
import { PasswordToggleIcon } from "@/components/ui/PasswordToggleIcon";
import {
  AFTER_LOGIN_DEFAULT,
  callbackNotice,
  loginErrorMessage,
  safeNextPath,
} from "@/lib/authFlow";

const linkClass =
  "rounded text-[#B4E655] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

// The page reads `?error=` (an auth-callback refusal) and `?next=` (where to
// land after signing in — audit M20, L21). useSearchParams needs a Suspense
// boundary at prerender time; the fallback is the same form with neither, so
// the first paint is never blank.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginForm notice={null} nextPath={AFTER_LOGIN_DEFAULT} />}>
      <LoginFormWithParams />
    </Suspense>
  );
}

function LoginFormWithParams() {
  const params = useSearchParams();
  return (
    <LoginForm
      notice={callbackNotice(params.get("error"))}
      nextPath={safeNextPath(params.get("next"))}
    />
  );
}

function LoginForm({ notice, nextPath }: { notice: string | null; nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      // Plain words and the one way out — never Supabase's own message.
      setError(loginErrorMessage(authError.message));
      setLoading(false);
      return;
    }

    trackEvent("login_success");
    router.push(nextPath);
    router.refresh();
  }

  return (
    // Top-aligned on phones (audit L9): the sticky header already takes the
    // top of the screen, so a full-height centred card left a blank band.
    <main className="flex min-h-[calc(100svh-80px)] items-start justify-center bg-[#061427] px-6 pb-16 pt-10 text-white md:items-center md:pt-0">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Sign in to your account</h1>
          <p className="mt-2 text-sm text-white/70">
            Access your enrollments and training dashboard.
          </p>
        </div>

        {notice && (
          <div
            role="status"
            className="mb-5 rounded-2xl border border-yellow-200/30 bg-yellow-200/5 px-5 py-4 text-sm text-white/80"
          >
            <p>{notice}</p>
            <Link href="/auth/forgot-password" className={`mt-2 inline-block font-semibold ${linkClass}`}>
              Send a new link →
            </Link>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-8"
        >
          <div className="grid gap-1.5">
            <label htmlFor="login-email" className="text-sm text-white/70">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm text-white/70">Password</label>
              <Link href="/auth/forgot-password" className={`text-xs ${linkClass}`}>
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-base text-white placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-white/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              >
                <PasswordToggleIcon visible={showPassword} />
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:cursor-wait disabled:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-sm text-white/60">
            New here?{" "}
            <Link href="/intake" className={linkClass}>
              Take the 2-minute quiz →
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

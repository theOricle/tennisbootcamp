"use client";

import { useState } from "react";
import Link from "next/link";
import { useBotCheck } from "@/lib/useBotCheck";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bot protection (backlog #29): honeypot field + fill time, same as the
  // four public forms. The route drops a tripped check silently.
  const bot = useBotCheck();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...bot.payload() }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Something went wrong — please try again or email info@tennisbootcamp.ca");
    } finally {
      setLoading(false);
    }
  }

  return (
    // Top-aligned on phones (audit L9), same as /login.
    <main className="flex min-h-[calc(100svh-80px)] items-start justify-center bg-[#061427] px-6 pb-16 pt-10 text-white md:items-center md:pt-0">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-sm text-white/60">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          // The route answers the same whether or not the address has an
          // account, and stays quiet inside its per-address cooldown — so
          // the page can only promise what it knows (audit M20).
          <div
            role="status"
            className="rounded-3xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-8 text-center"
          >
            <p className="text-sm text-white/80">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
              Check your spam folder too.
            </p>
            <p className="mt-3 text-sm text-white/60">
              Nothing after a few minutes? Try again, or email{" "}
              <a href="mailto:info@tennisbootcamp.ca" className="text-[#B4E655] hover:underline">
                info@tennisbootcamp.ca
              </a>
              .
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-sm text-[#B4E655] hover:underline"
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-8"
          >
            {bot.field}
            <div className="grid gap-1.5">
              <label htmlFor="fp-email" className="text-sm text-white/70">Email</label>
              <input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <p className="text-center text-sm text-white/60">
              <Link
                href="/login"
                className="text-[#B4E655] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] rounded"
              >
                ← Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

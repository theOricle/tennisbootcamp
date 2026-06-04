"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061427] px-6 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-sm text-white/60">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-3xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-8 text-center">
            <p className="text-sm text-white/80">
              Check your inbox — a reset link is on its way to{" "}
              <strong>{email}</strong>.
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
            <div className="grid gap-1.5">
              <label className="text-sm text-white/70">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <p className="text-center text-sm text-white/50">
              <Link href="/login" className="text-[#B4E655] hover:underline">
                ← Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

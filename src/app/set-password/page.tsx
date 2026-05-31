"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function SetPasswordPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setError(pwError.message);
      setLoading(false);
      return;
    }

    if (fullName.trim()) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        await supabase
          .from("profiles")
          .update({ full_name: fullName.trim() })
          .eq("id", userData.user.id);
      }
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061427] px-6 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="mt-2 text-sm text-white/60">
            Create a password to secure your Tennis Bootcamp account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-8"
        >
          <div className="grid gap-1.5">
            <label className="text-sm text-white/70">
              Full name{" "}
              <span className="text-white/40">(optional)</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm text-white/70">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm text-white/70">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save password & continue"}
          </button>
        </form>
      </div>
    </main>
  );
}

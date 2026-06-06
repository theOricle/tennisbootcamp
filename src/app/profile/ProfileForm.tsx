"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  userId: string;
  email: string;
  initialFullName: string;
  initialPhone: string;
};

export function ProfileForm({ userId, email, initialFullName, initialPhone }: Props) {
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
      .eq("id", userId);
    setStatus(error ? "error" : "saved");
    if (!error) setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Email — read-only */}
      <div className="grid gap-1.5">
        <label className="text-sm text-white/60">Email</label>
        <input
          readOnly
          value={email}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white/50 focus:outline-none md:text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm text-white/70">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30 md:text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm text-white/70">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 416 000 0000"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30 md:text-sm"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" && (
          <p className="text-sm text-[#B4E655]">Saved.</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red-400">Something went wrong — try again.</p>
        )}
      </div>
    </form>
  );
}

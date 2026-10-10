"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { phoneError, withHumanFallback } from "@/lib/formValidation";
import {
  FieldError,
  FormAlert,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  fieldA11y,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

type Props = {
  email: string;
  initialFullName: string;
  initialPhone: string;
};

// The holder's own details. Saved through /api/profile (src/lib/players.ts),
// which writes the profile and the holder's player row together, so a name
// edit reaches the dashboard greeting and the admin list (audit M34).
export function ProfileForm({ email, initialFullName, initialPhone }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    const problem = phoneError(phone, { required: false });
    setPhoneProblem(problem);
    if (problem) {
      document.getElementById("profile-phone")?.focus();
      return;
    }
    setStatus("saving");
    setErrorText(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorText(typeof data.error === "string" ? data.error : null);
        setStatus("error");
        return;
      }
      setStatus("saved");
      // The RankCard and the players list above read the new name.
      router.refresh();
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {/* Email — read-only, but focusable with a visible ring (audit L7). */}
      <div className="grid gap-1.5">
        <label htmlFor="profile-email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          id="profile-email"
          readOnly
          value={email}
          className={`w-full rounded-2xl border border-white/15 bg-transparent px-4 py-3 text-base text-white/75 md:text-sm ${FOCUS_RING}`}
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="profile-name" className={LABEL_CLASS}>
          Full name
        </label>
        <input
          id="profile-name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="profile-phone" className={LABEL_CLASS}>
          Phone
        </label>
        <input
          id="profile-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneProblem && !phoneError(e.target.value, { required: false })) setPhoneProblem(null);
          }}
          onBlur={(e) => setPhoneProblem(phoneError(e.target.value, { required: false }))}
          placeholder="+1 416 000 0000"
          className={INPUT_CLASS}
          {...fieldA11y("profile-phone", { error: phoneProblem })}
        />
        <FieldError fieldId="profile-phone" message={phoneProblem} />
      </div>

      {status === "error" && (
        <FormAlert>{withHumanFallback(errorText ?? "Your changes weren't saved. Try again.")}</FormAlert>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          aria-disabled={status === "saving" || undefined}
          className={`min-h-[44px] rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 ${status === "saving" ? "cursor-wait opacity-80" : ""} ${FOCUS_RING}`}
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        <LiveStatus
          visible={status === "saved"}
          className="text-sm text-[#B4E655]"
          message={status === "saved" ? "Saved." : status === "saving" ? "Saving your changes…" : ""}
        />
      </div>
    </form>
  );
}

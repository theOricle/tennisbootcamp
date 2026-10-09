"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/analytics";
import { PasswordToggleIcon } from "@/components/ui/PasswordToggleIcon";
import {
  FIELD_MESSAGES,
  newPasswordError,
  passwordUpdateErrorMessage,
} from "@/lib/formValidation";
import {
  FieldError,
  FormAlert,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  fieldA11y,
  hintIdFor,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

type FieldErrors = { password?: string; confirm?: string };

function confirmError(password: string, confirm: string): string | undefined {
  if (!confirm) return "Type the same password again.";
  return confirm === password ? undefined : FIELD_MESSAGES.passwordMismatch;
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Each field's problem, shown on press or when a filled field loses focus
  // (audit M19). The button stays enabled.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const nextErrors: FieldErrors = {
      password: newPasswordError(password) ?? undefined,
      confirm: confirmError(password, confirm),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.password || nextErrors.confirm) {
      document.getElementById(nextErrors.password ? "sp-password" : "sp-confirm")?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      // Plain words and the way out, never Supabase's own text.
      setError(passwordUpdateErrorMessage(pwError.message));
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

    trackEvent("password_set_success");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061427] px-6 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="mt-2 text-sm text-white/70">
            Create a password to secure your Tennis Bootcamp account.
          </p>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-8"
        >
          <div className="grid gap-1.5">
            <label htmlFor="sp-fullname" className={LABEL_CLASS}>
              Full name <span className="text-white/60">(optional)</span>
            </label>
            <input
              id="sp-fullname"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="sp-password" className={LABEL_CLASS}>Password</label>
            <div className="relative">
              <input
                id="sp-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password && !newPasswordError(e.target.value)) {
                    setFieldErrors((f) => ({ ...f, password: undefined }));
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value) {
                    setFieldErrors((f) => ({ ...f, password: newPasswordError(e.target.value) ?? undefined }));
                  }
                }}
                required
                className={`${INPUT_CLASS} pr-12`}
                {...fieldA11y("sp-password", { error: fieldErrors.password, hint: !fieldErrors.password })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={`absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-white/70 hover:text-white ${FOCUS_RING}`}
              >
                <PasswordToggleIcon visible={showPassword} />
              </button>
            </div>
            {/* The hint gives way to the error, which says the same thing. */}
            {!fieldErrors.password && (
              <p id={hintIdFor("sp-password")} className={HINT_CLASS}>
                At least 8 characters.
              </p>
            )}
            <FieldError fieldId="sp-password" message={fieldErrors.password} />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="sp-confirm" className={LABEL_CLASS}>Confirm password</label>
            <div className="relative">
              <input
                id="sp-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (fieldErrors.confirm && !confirmError(password, e.target.value)) {
                    setFieldErrors((f) => ({ ...f, confirm: undefined }));
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value) {
                    setFieldErrors((f) => ({ ...f, confirm: confirmError(password, e.target.value) }));
                  }
                }}
                placeholder="Repeat password"
                required
                className={`${INPUT_CLASS} pr-12`}
                {...fieldA11y("sp-confirm", { error: fieldErrors.confirm })}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className={`absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-white/70 hover:text-white ${FOCUS_RING}`}
              >
                <PasswordToggleIcon visible={showConfirm} />
              </button>
            </div>
            <FieldError fieldId="sp-confirm" message={fieldErrors.confirm} />
          </div>

          {error && <FormAlert>{error}</FormAlert>}
          <LiveStatus message={loading ? "Saving your password…" : ""} />

          <button
            type="submit"
            aria-disabled={loading || undefined}
            className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 ${loading ? "cursor-wait opacity-80" : ""} ${FOCUS_RING}`}
          >
            {loading && (
              <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? "Saving…" : "Save password & continue"}
          </button>
        </form>
      </div>
    </main>
  );
}

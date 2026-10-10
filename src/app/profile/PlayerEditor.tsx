"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from "@/lib/ageBand";
import { withHumanFallback } from "@/lib/formValidation";
import {
  FieldError,
  FormAlert,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  fieldA11y,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

// One player on the holder's account, managed from /profile (audit M34):
// rename, change the age group, or remove someone added by mistake. Every
// write goes to /api/participants, which only touches the session's own
// account through src/lib/players.ts. Removal is refused, with the reason,
// for a player with a level or any booking or enrollment behind them.

const outlineButton = `inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white ${FOCUS_RING}`;
const primaryButton = `inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#B4E655] px-5 text-sm font-semibold text-[#061427] transition hover:brightness-110 ${FOCUS_RING}`;

export function PlayerEditor({
  id,
  name,
  ageBand,
  removable,
}: {
  id: string;
  name: string;
  /** The stored band, or null before migration 0009 / never asked. */
  ageBand: AgeBand | null;
  /** False for a player with a level: the API would refuse, so no button. */
  removable: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "editing" | "removing">("idle");
  const [fullName, setFullName] = useState(name);
  const [band, setBand] = useState<AgeBand | "">(ageBand ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const first = name.trim().split(/\s+/)[0] || "this player";
  const nameId = `player-${id}-name`;
  const bandId = `player-${id}-age`;

  async function send(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/participants", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(withHumanFallback(typeof data.error === "string" ? data.error : "That didn't save. Try again."));
        return false;
      }
      return true;
    } catch {
      setError(withHumanFallback("We couldn't reach the server. Try again."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    if (!fullName.trim()) {
      setNameProblem("Enter their full name.");
      document.getElementById(nameId)?.focus();
      return;
    }
    setNameProblem(null);
    const ok = await send("PATCH", { fullName: fullName.trim(), ...(band ? { ageBand: band } : {}) });
    if (ok) {
      setMode("idle");
      setSaved(true);
      router.refresh();
    }
  }

  async function remove() {
    if (busy) return;
    const ok = await send("DELETE", {});
    if (ok) router.refresh();
  }

  if (mode === "editing") {
    return (
      <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
        <div className="grid gap-1.5">
          <label htmlFor={nameId} className={LABEL_CLASS}>
            Full name
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="off"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (nameProblem && e.target.value.trim()) setNameProblem(null);
            }}
            className={INPUT_CLASS}
            {...fieldA11y(nameId, { error: nameProblem })}
          />
          <FieldError fieldId={nameId} message={nameProblem} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={bandId} className={LABEL_CLASS}>
            Age group
          </label>
          <select
            id={bandId}
            value={band}
            onChange={(e) => setBand(e.target.value as AgeBand)}
            className={INPUT_CLASS}
          >
            {!band && (
              <option value="" className="bg-[#061427]">
                Choose one…
              </option>
            )}
            {AGE_BANDS.map((b) => (
              <option key={b} value={b} className="bg-[#061427]">
                {AGE_BAND_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
        {error && <FormAlert>{error}</FormAlert>}
        <LiveStatus message={busy ? "Saving…" : ""} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} className={primaryButton} aria-disabled={busy || undefined}>
            {busy ? "Saving…" : "Save player"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
              setFullName(name);
              setBand(ageBand ?? "");
            }}
            className={outlineButton}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "removing") {
    return (
      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        <p className="text-sm text-white">Remove {first} from your account?</p>
        <p className="text-xs text-white/60">
          Only for someone added by mistake. A player with a booking or enrollment stays on file.
        </p>
        {error && <FormAlert>{error}</FormAlert>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void remove()}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-400/50 px-5 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 ${FOCUS_RING}`}
            aria-disabled={busy || undefined}
          >
            {busy ? "Removing…" : `Remove ${first}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            className={outlineButton}
          >
            Keep {first}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setMode("editing")} className={outlineButton}>
        Edit<span className="sr-only"> {name}</span>
      </button>
      {removable && (
        <button
          type="button"
          onClick={() => setMode("removing")}
          className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-white/70 transition hover:text-white ${FOCUS_RING}`}
        >
          Remove<span className="sr-only"> {name}</span>
        </button>
      )}
      <LiveStatus visible={saved} className="text-sm text-[#B4E655]" message={saved ? "Saved." : ""} />
    </div>
  );
}

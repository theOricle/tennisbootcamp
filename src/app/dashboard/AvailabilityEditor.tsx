"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AvailabilityGrid,
  AvailabilityHoursLegend,
} from "@/components/ui/AvailabilityGrid";
import {
  AVAILABILITY_SOURCE_LABELS,
  hasAnyAvailability,
  type Availability,
  type AvailabilitySource,
} from "@/lib/availability";

// One player's availability on the dashboard — one card per person on the
// account. Same day × band grid as intake and request-a-time, the hour
// definitions shown from the one shared constant, an optional one-line note,
// and one button that stamps the grid as confirmed for the season
// (availability_source = 'dashboard').

const NOTE_MAX = 140;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

export function AvailabilityEditor({
  participantId,
  participantName = "",
  showName = false,
  initialAvailability,
  initialNote,
  updatedAt,
  source,
}: {
  /** Which player on the account this grid belongs to. */
  participantId: string;
  participantName?: string;
  /** Households with more than one player name whose week this is. */
  showName?: boolean;
  initialAvailability: Availability;
  initialNote: string;
  updatedAt: string | null;
  source: AvailabilitySource | null;
}) {
  const router = useRouter();
  const [availability, setAvailability] = useState<Availability>(initialAvailability);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(
    source === "dashboard" ? updatedAt : null
  );

  const noteId = `availability-note-${participantId}`;

  const dirty =
    JSON.stringify(availability) !== JSON.stringify(initialAvailability) ||
    note.trim() !== initialNote.trim();

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId,
          availability,
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save your availability. Try again or email info@tennisbootcamp.ca.");
        return;
      }
      setConfirmedAt(data.updatedAt ?? new Date().toISOString());
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again or email info@tennisbootcamp.ca.");
    } finally {
      setBusy(false);
    }
  }

  const statusLine = (() => {
    if (confirmedAt && !dirty) return `Confirmed for the season on ${fmtDate(confirmedAt)}.`;
    if (updatedAt && source) {
      return `On file ${AVAILABILITY_SOURCE_LABELS[source]} · ${fmtDate(updatedAt)}. Confirm it so your coach can build around it.`;
    }
    if (!hasAnyAvailability(initialAvailability)) {
      return showName && participantName
        ? `Nothing on file for ${participantName} yet. Tap the times they can train and confirm.`
        : "Nothing on file yet. Tap the times you can train and confirm.";
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/70">
        {showName && participantName
          ? `Groups form around shared availability. Keep ${participantName}'s week current and their coach can place them in a cohort that fits.`
          : "Groups form around shared availability. Keep this current and your coach can place you in a cohort that fits your week."}
      </p>
      <AvailabilityHoursLegend />
      <AvailabilityGrid value={availability} onChange={setAvailability} />

      <div className="grid gap-1.5">
        <label htmlFor={noteId} className="text-sm text-white/70">
          Anything your coach should know? <span className="text-white/40">(optional)</span>
        </label>
        <input
          id={noteId}
          type="text"
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Away the first two weeks of October"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
        />
      </div>

      {statusLine && <p className="text-xs text-white/50">{statusLine}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy || !hasAnyAvailability(availability)}
        className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] disabled:opacity-40"
      >
        {busy ? "Saving…" : "Confirm for the season"}
      </button>
    </div>
  );
}

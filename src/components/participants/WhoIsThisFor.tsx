"use client";

import { useCallback, useEffect, useState } from "react";

// "Who is this for?" — the first question on every flow that books, quizzes or
// enrolls someone (backlog #11). One account holder can register several
// people; this component is the single place that asks which of them a form is
// about.
//
// Signed in  → the holder's participants, plus "Add a person".
// Signed out → a repeatable participant block; each block becomes its own
//              participant row (and its own booking / intake row / invite)
//              under the holder's email once the account is provisioned.

export const RELATIONSHIPS = ["self", "child", "spouse", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: "Myself",
  child: "My child",
  spouse: "My spouse or partner",
  other: "Someone else",
};

/** Optional self-estimate. The coach's on-court level is the source of truth. */
export const SELF_LEVELS = [
  { value: "", label: "Prefer not to say" },
  { value: "new", label: "Just starting out" },
  { value: "rally", label: "I can rally" },
  { value: "competitive", label: "I play competitively" },
  { value: "unsure", label: "Not sure" },
];

export type ParticipantOption = {
  id: string;
  name: string | null;
  relationship: string;
  isMinor: boolean;
  level: number | null;
};

export type GuestParticipant = {
  key: string;
  name: string;
  relationship: Relationship;
  isMinor: boolean;
  /** Self-estimate carried into the booking; never written as a coach level. */
  selfLevel: string;
};

export type HouseholdValue = {
  /** Signed in: the participant ids this form is about. */
  selectedIds: string[];
  /** Signed out: the people entered by hand, each becoming its own row. */
  guests: GuestParticipant[];
};

export function emptyGuest(relationship: Relationship = "self"): GuestParticipant {
  return {
    key: Math.random().toString(36).slice(2, 10),
    name: "",
    relationship,
    isMinor: relationship === "child",
    selfLevel: "",
  };
}

export const EMPTY_HOUSEHOLD: HouseholdValue = {
  selectedIds: [],
  guests: [emptyGuest("self")],
};

/** The people a submission is actually about, signed in or out. */
export function householdCount(
  value: HouseholdValue,
  signedIn: boolean
): number {
  return signedIn
    ? value.selectedIds.length
    : value.guests.filter((g) => g.name.trim().length > 0).length;
}

export function householdReady(
  value: HouseholdValue,
  signedIn: boolean
): boolean {
  return householdCount(value, signedIn) > 0;
}

/** Display name for the first person a submission is about. */
export function primaryName(
  value: HouseholdValue,
  signedIn: boolean,
  participants: ParticipantOption[]
): string {
  if (signedIn) {
    const first = participants.find((p) => p.id === value.selectedIds[0]);
    return first?.name?.trim() ?? "";
  }
  return value.guests.find((g) => g.name.trim())?.name.trim() ?? "";
}

// ─── Household hook ───────────────────────────────────────────────────────────

export type Household = {
  loading: boolean;
  signedIn: boolean;
  accountEmail: string;
  participants: ParticipantOption[];
  reload: () => void;
};

/**
 * The signed-in holder's people. A signed-out visitor (or an unconfigured
 * Supabase) simply reports `signedIn: false` and the guest blocks render.
 */
export function useHousehold(): Household {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch("/api/participants")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSignedIn(Boolean(d.signedIn));
        setAccountEmail(d.accountEmail ?? "");
        setParticipants(Array.isArray(d.participants) ? d.participants : []);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  return { loading, signedIn, accountEmail, participants, reload };
}

// ─── Shared field styles ──────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder-white/35 " +
  "focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30 md:text-sm";

function labelName(p: ParticipantOption): string {
  return p.name?.trim() || "Unnamed player";
}

function relationshipNote(p: ParticipantOption): string {
  const rel = (RELATIONSHIPS as readonly string[]).includes(p.relationship)
    ? RELATIONSHIP_LABELS[p.relationship as Relationship]
    : "";
  const level = p.level != null ? `Level ${p.level.toFixed(1)}` : "Not leveled yet";
  return [rel, level].filter(Boolean).join(" · ");
}

// ─── Add-a-person (signed in) ─────────────────────────────────────────────────

function AddPersonForm({
  onAdded,
  onCancel,
}: {
  onAdded: (p: ParticipantOption) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("child");
  const [isMinor, setIsMinor] = useState(true);
  const [selfLevel, setSelfLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!fullName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), relationship, isMinor }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add that person.");
        return;
      }
      onAdded({ ...data.participant, selfLevel } as ParticipantOption);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#B4E655]/25 bg-[#B4E655]/5 p-4">
      <p className="text-sm font-semibold text-white">Add a person</p>
      <div className="grid gap-1.5">
        <label htmlFor="add-person-name" className="text-sm text-white/70">
          Full name
        </label>
        <input
          id="add-person-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Maya Chen"
          className={inputClass}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="add-person-rel" className="text-sm text-white/70">
          Who are they to you?
        </label>
        <select
          id="add-person-rel"
          value={relationship}
          onChange={(e) => {
            const next = e.target.value as Relationship;
            setRelationship(next);
            if (next === "child") setIsMinor(true);
            if (next === "self" || next === "spouse") setIsMinor(false);
          }}
          className={inputClass}
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r} className="bg-[#061427]">
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <input
          type="checkbox"
          checked={isMinor}
          onChange={(e) => setIsMinor(e.target.checked)}
          className="h-4 w-4 accent-[#B4E655]"
        />
        <span className="text-sm text-white/75">They&apos;re under 18</span>
      </label>
      <div className="grid gap-1.5">
        <label htmlFor="add-person-level" className="text-sm text-white/70">
          Where&apos;s their game right now?{" "}
          <span className="text-white/35">(optional)</span>
        </label>
        <select
          id="add-person-level"
          value={selfLevel}
          onChange={(e) => setSelfLevel(e.target.value)}
          className={inputClass}
        >
          {SELF_LEVELS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#061427]">
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-white/40">
          A starting point only — their level comes from the court.
        </p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!fullName.trim() || busy}
          className="min-h-[44px] rounded-full bg-[#B4E655] px-5 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add them"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-full bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Guest block (signed out) ─────────────────────────────────────────────────

function GuestBlock({
  guest,
  index,
  removable,
  onChange,
  onRemove,
}: {
  guest: GuestParticipant;
  index: number;
  removable: boolean;
  onChange: (next: GuestParticipant) => void;
  onRemove: () => void;
}) {
  const id = `guest-${guest.key}`;
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">
          {index === 0 ? "Player" : `Player ${index + 1}`}
        </p>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className="min-h-[44px] text-sm text-white/50 underline-offset-2 transition hover:text-white hover:underline"
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm text-white/70">
          Full name
        </label>
        <input
          id={`${id}-name`}
          type="text"
          value={guest.name}
          onChange={(e) => onChange({ ...guest, name: e.target.value })}
          placeholder={index === 0 ? "Your name" : "Their name"}
          className={inputClass}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-rel`} className="text-sm text-white/70">
          Who is this?
        </label>
        <select
          id={`${id}-rel`}
          value={guest.relationship}
          onChange={(e) => {
            const relationship = e.target.value as Relationship;
            onChange({
              ...guest,
              relationship,
              isMinor:
                relationship === "child"
                  ? true
                  : relationship === "other"
                    ? guest.isMinor
                    : false,
            });
          }}
          className={inputClass}
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r} className="bg-[#061427]">
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <input
          type="checkbox"
          checked={guest.isMinor}
          onChange={(e) => onChange({ ...guest, isMinor: e.target.checked })}
          className="h-4 w-4 accent-[#B4E655]"
        />
        <span className="text-sm text-white/75">They&apos;re under 18</span>
      </label>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-level`} className="text-sm text-white/70">
          Where&apos;s their game right now?{" "}
          <span className="text-white/35">(optional)</span>
        </label>
        <select
          id={`${id}-level`}
          value={guest.selfLevel}
          onChange={(e) => onChange({ ...guest, selfLevel: e.target.value })}
          className={inputClass}
        >
          {SELF_LEVELS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#061427]">
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── The chooser ──────────────────────────────────────────────────────────────

export function WhoIsThisFor({
  household,
  value,
  onChange,
  multiple = false,
  intro,
}: {
  household: Household;
  value: HouseholdValue;
  onChange: (next: HouseholdValue) => void;
  /** Enroll and the quiz take several people at once; a booking is one slot. */
  multiple?: boolean;
  intro?: string;
}) {
  const { loading, signedIn, participants, reload } = household;
  const [adding, setAdding] = useState(false);

  // Default the selection to the holder themselves once we know who they are.
  useEffect(() => {
    if (!signedIn || participants.length === 0) return;
    if (value.selectedIds.length > 0) return;
    const self =
      participants.find((p) => p.relationship === "self") ?? participants[0];
    onChange({ ...value, selectedIds: [self.id] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, participants]);

  if (loading) {
    return <p className="text-sm text-white/45">Loading who&apos;s on your account…</p>;
  }

  if (signedIn) {
    function toggle(id: string) {
      if (multiple) {
        const next = value.selectedIds.includes(id)
          ? value.selectedIds.filter((x) => x !== id)
          : [...value.selectedIds, id];
        onChange({ ...value, selectedIds: next });
      } else {
        onChange({ ...value, selectedIds: [id] });
      }
    }

    return (
      <div className="space-y-3">
        {intro && <p className="text-sm text-white/60">{intro}</p>}
        <div className="grid gap-2">
          {participants.map((p) => {
            const selected = value.selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={selected}
                className={[
                  "flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-[#B4E655]/60 bg-[#B4E655]/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-white">
                    {labelName(p)}
                  </span>
                  <span className="block text-xs text-white/50">
                    {relationshipNote(p)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    "h-5 w-5 shrink-0 border",
                    multiple ? "rounded-sm" : "rounded-full",
                    selected ? "border-[#B4E655] bg-[#B4E655]/40" : "border-white/20",
                  ].join(" ")}
                />
              </button>
            );
          })}
        </div>

        {adding ? (
          <AddPersonForm
            onAdded={(p) => {
              setAdding(false);
              reload();
              onChange({
                ...value,
                selectedIds: multiple ? [...value.selectedIds, p.id] : [p.id],
              });
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-[44px] w-full rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white"
          >
            + Add a person
          </button>
        )}
      </div>
    );
  }

  // Signed out: the account holder's own details live on the contact step of
  // each form; here we collect the people those details are for.
  return (
    <div className="space-y-3">
      {intro && <p className="text-sm text-white/60">{intro}</p>}
      {value.guests.map((g, i) => (
        <GuestBlock
          key={g.key}
          guest={g}
          index={i}
          removable={value.guests.length > 1}
          onChange={(next) =>
            onChange({
              ...value,
              guests: value.guests.map((x) => (x.key === g.key ? next : x)),
            })
          }
          onRemove={() =>
            onChange({
              ...value,
              guests: value.guests.filter((x) => x.key !== g.key),
            })
          }
        />
      ))}
      {multiple && (
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, guests: [...value.guests, emptyGuest("child")] })
          }
          className="min-h-[44px] w-full rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white"
        >
          + Add another person
        </button>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  ageBandIsMinor,
  type AgeBand,
} from "@/lib/ageBand";
import { SELF_LEVELS } from "@/lib/level";
import { withHumanFallback, type FieldIssue } from "@/lib/formValidation";
import {
  FieldError,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  fieldA11y,
  hintIdFor,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

// "Who is this for?" — the first question on every flow that books, quizzes or
// enrolls someone (backlog #11). One account holder can register several
// people; this component is the single place that asks which of them a form is
// about.
//
// Signed in  → the holder's participants, plus "Add a person" (saved to the
//              account at once) — or, with `addInline` (the quiz, backlog
//              #24), "Add someone": a typed block that /api/intake creates
//              under the signed-in account when the quiz is submitted, so an
//              abandoned quiz leaves nothing behind.
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

// The self-estimate options live in src/lib/level.ts (SELF_LEVELS, audit
// M21): one list, with "elite", shared by the quiz, booking and the admin.

/** The band we assume from a relationship. Always editable by the player. */
export function defaultAgeBand(relationship: Relationship): AgeBand {
  return relationship === "child" ? "junior" : "adult";
}

export type ParticipantOption = {
  id: string;
  name: string | null;
  relationship: string;
  isMinor: boolean;
  level: number | null;
};

/** Age + self-estimate for one player, asked wherever a form places them. */
export type ParticipantProfile = {
  ageBand: AgeBand;
  selfLevel: string;
};

export type GuestParticipant = {
  key: string;
  name: string;
  relationship: Relationship;
  /** Follows from `ageBand` — kept because every flow downstream reads it. */
  isMinor: boolean;
  ageBand: AgeBand;
  /** Self-estimate carried into the booking; never written as a coach level. */
  selfLevel: string;
};

export type HouseholdValue = {
  /** Signed in: the participant ids this form is about. */
  selectedIds: string[];
  /** Signed out: the people entered by hand, each becoming its own row. */
  guests: GuestParticipant[];
  /**
   * Signed in: age band + self-estimate per participant id. Read defensively
   * everywhere — a value restored from a session written before backlog #14
   * (an intake → booking prefill) has no map at all.
   */
  profiles: Record<string, ParticipantProfile>;
};

export function emptyGuest(relationship: Relationship = "self"): GuestParticipant {
  const ageBand = defaultAgeBand(relationship);
  return {
    key: Math.random().toString(36).slice(2, 10),
    name: "",
    relationship,
    isMinor: ageBandIsMinor(ageBand),
    ageBand,
    selfLevel: "",
  };
}

export const EMPTY_HOUSEHOLD: HouseholdValue = {
  selectedIds: [],
  guests: [emptyGuest("self")],
  profiles: {},
};

/**
 * Signed in, the typed blocks are people being added to the account (backlog
 * #24): never the holder, who is picked from the list. The untouched "self"
 * block every form starts with is not one of them.
 */
export function addedGuests(value: HouseholdValue): GuestParticipant[] {
  return value.guests.filter((g) => g.relationship !== "self");
}

function namedGuests(guests: GuestParticipant[]): GuestParticipant[] {
  return guests.filter((g) => g.name.trim().length > 0);
}

/** The people a submission is actually about, signed in or out. */
export function householdCount(
  value: HouseholdValue,
  signedIn: boolean
): number {
  return signedIn
    ? value.selectedIds.length + namedGuests(addedGuests(value)).length
    : namedGuests(value.guests).length;
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
    return (
      first?.name?.trim() ??
      namedGuests(addedGuests(value))[0]?.name.trim() ??
      ""
    );
  }
  return value.guests.find((g) => g.name.trim())?.name.trim() ?? "";
}

/** A saved participant carries `is_minor`, not a band — assume the youngest. */
function participantAgeBand(p: ParticipantOption): AgeBand {
  return p.isMinor ? "junior" : "adult";
}

/** One entry per player a submission is about, signed in or out. */
export type HouseholdPerson = {
  key: string;
  name: string;
  ageBand: AgeBand;
  selfLevel: string;
};

export function householdPeople(
  value: HouseholdValue,
  signedIn: boolean,
  participants: ParticipantOption[]
): HouseholdPerson[] {
  const fromGuests = (guests: GuestParticipant[]): HouseholdPerson[] =>
    namedGuests(guests).map((g) => ({
      key: g.key,
      name: g.name.trim(),
      ageBand: g.ageBand,
      selfLevel: g.selfLevel,
    }));

  if (signedIn) {
    // Chosen people first, then anyone being added — the same order
    // /api/intake resolves them in, so result cards and rows pair up.
    const chosen = value.selectedIds
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is ParticipantOption => Boolean(p))
      .map((p) => {
        const profile = value.profiles?.[p.id];
        return {
          key: p.id,
          name: p.name?.trim() || "This player",
          ageBand: profile?.ageBand ?? participantAgeBand(p),
          selfLevel: profile?.selfLevel ?? "",
        };
      });
    return [...chosen, ...fromGuests(addedGuests(value))];
  }
  return fromGuests(value.guests);
}

/**
 * True when every named player has answered the self-estimate. Forms that
 * place a player off these answers (the intake quiz) gate Next on it; forms
 * that only need a name (booking, enroll) never ask.
 */
export function householdProfilesReady(
  value: HouseholdValue,
  signedIn: boolean,
  participants: ParticipantOption[]
): boolean {
  const people = householdPeople(value, signedIn, participants);
  return people.length > 0 && people.every((p) => p.selfLevel.length > 0);
}

// ─── Validation (audit M18, M19) ──────────────────────────────────────────────

/** The heading a typed block carries; also how errors name the player. */
export function guestTitle(index: number, signedIn: boolean): string {
  if (signedIn) return index === 0 ? "New player" : `New player ${index + 1}`;
  return index === 0 ? "Player" : `Player ${index + 1}`;
}

/** Field ids, shared by the blocks and the issues that point at them. */
export const householdFieldIds = {
  choose: "household-choose",
  guestName: (key: string) => `guest-${key}-name`,
  guestLevel: (key: string) => `guest-${key}-level`,
  participantLevel: (id: string) => `participant-${id}-level`,
};

function levelMissing(self: boolean): string {
  return self
    ? "Choose where your game is right now, or Not sure."
    : "Choose where their game is right now, or Not sure.";
}

/**
 * What stops this chooser from moving on, one issue per field, in screen
 * order. A typed block with no name is never dropped silently (audit M18):
 * it is flagged, and the player can name it or remove it. `requireProfile`
 * (the quiz) also asks for each player's self-estimate.
 */
export function householdIssues(
  value: HouseholdValue,
  signedIn: boolean,
  participants: ParticipantOption[],
  { requireProfile = false }: { requireProfile?: boolean } = {}
): FieldIssue[] {
  const issues: FieldIssue[] = [];

  const guestIssues = (guests: GuestParticipant[]) => {
    guests.forEach((g, i) => {
      const self = g.relationship === "self";
      if (!g.name.trim()) {
        const lone = !signedIn && guests.length === 1;
        issues.push({
          id: householdFieldIds.guestName(g.key),
          message: lone
            ? self
              ? "Add your full name."
              : "Add the player's full name."
            : `Add a name for ${guestTitle(i, signedIn)}, or remove this player.`,
        });
      }
      if (requireProfile && !g.selfLevel) {
        issues.push({ id: householdFieldIds.guestLevel(g.key), message: levelMissing(self) });
      }
    });
  };

  if (signedIn) {
    const added = addedGuests(value);
    if (value.selectedIds.length === 0 && added.length === 0) {
      issues.push({
        id: householdFieldIds.choose,
        message: "Choose who this is for, or add someone.",
      });
    }
    if (requireProfile) {
      for (const id of value.selectedIds) {
        const p = participants.find((x) => x.id === id);
        if (!p) continue;
        if (!value.profiles?.[id]?.selfLevel) {
          issues.push({
            id: householdFieldIds.participantLevel(id),
            message: levelMissing(p.relationship === "self"),
          });
        }
      }
    }
    guestIssues(added);
    return issues;
  }

  guestIssues(value.guests);
  return issues;
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

/** The field look is the shared primitive (audit L1, M23). */
const inputClass = INPUT_CLASS;

/** Age band select — the one place a player's age is asked. */
function AgeBandField({
  id,
  value,
  onChange,
  label = "How old are they?",
}: {
  id: string;
  value: AgeBand;
  onChange: (next: AgeBand) => void;
  label?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as AgeBand)}
        className={inputClass}
      >
        {AGE_BANDS.map((b) => (
          <option key={b} value={b} className="bg-[#061427]">
            {AGE_BAND_LABELS[b]}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Self-estimate select. Optional unless the form places off the answer. The
 * options speak to whoever answers (audit M18): "I can rally" for yourself,
 * "They can rally" for a child or partner.
 */
function SelfLevelField({
  id,
  value,
  onChange,
  required = false,
  self = false,
  label = "Where's their game right now?",
  note,
  error,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  /** True when the player is the person answering. */
  self?: boolean;
  label?: string;
  note?: string;
  error?: string | null;
}) {
  const options = required
    ? [
        { value: "", text: "Choose one…" },
        ...SELF_LEVELS.filter((o) => o.value !== "").map((o) => ({
          value: o.value,
          text: self ? o.label : o.labelOther,
        })),
      ]
    : SELF_LEVELS.map((o) => ({ value: o.value, text: self ? o.label : o.labelOther }));
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}{" "}
        {!required && <span className="text-white/60">(optional)</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={inputClass}
        {...fieldA11y(id, { error, hint: Boolean(note) })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#061427]">
            {o.text}
          </option>
        ))}
      </select>
      {note && (
        <p id={hintIdFor(id)} className={HINT_CLASS}>
          {note}
        </p>
      )}
      <FieldError fieldId={id} message={error} />
    </div>
  );
}

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
  requireLevel,
}: {
  onAdded: (p: ParticipantOption, profile: ParticipantProfile) => void;
  onCancel: () => void;
  requireLevel: boolean;
}) {
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("child");
  const [ageBand, setAgeBand] = useState<AgeBand>(defaultAgeBand("child"));
  const [selfLevel, setSelfLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checked when "Add them" is pressed; the button itself stays enabled.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; level?: string }>({});
  const isMinor = ageBandIsMinor(ageBand);

  async function save() {
    if (busy) return;
    const nextErrors = {
      name: fullName.trim() ? undefined : "Add their full name.",
      level: requireLevel && !selfLevel ? levelMissing(false) : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.name || nextErrors.level) {
      document.getElementById(nextErrors.name ? "add-person-name" : "add-person-level")?.focus();
      return;
    }
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
        setError(withHumanFallback(data.error ?? "We couldn't add that person. Try again."));
        return;
      }
      onAdded(data.participant as ParticipantOption, { ageBand, selfLevel });
    } catch {
      setError(withHumanFallback("We couldn't reach the server. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-[#B4E655]/25 bg-[#B4E655]/5 p-4">
      <legend className="sr-only">Add a person</legend>
      <p aria-hidden="true" className="text-sm font-semibold text-white">
        Add a person
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="add-person-name" className={LABEL_CLASS}>
          Full name
        </label>
        <input
          id="add-person-name"
          type="text"
          autoComplete="off"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (fieldErrors.name && e.target.value.trim()) {
              setFieldErrors((f) => ({ ...f, name: undefined }));
            }
          }}
          placeholder="Maya Chen"
          required
          className={inputClass}
          {...fieldA11y("add-person-name", { error: fieldErrors.name })}
        />
        <FieldError fieldId="add-person-name" message={fieldErrors.name} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="add-person-rel" className={LABEL_CLASS}>
          Who are they to you?
        </label>
        <select
          id="add-person-rel"
          value={relationship}
          onChange={(e) => {
            const next = e.target.value as Relationship;
            setRelationship(next);
            setAgeBand(defaultAgeBand(next));
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
      <AgeBandField id="add-person-age" value={ageBand} onChange={setAgeBand} />
      <SelfLevelField
        id="add-person-level"
        value={selfLevel}
        onChange={(next) => {
          setSelfLevel(next);
          if (fieldErrors.level && next) setFieldErrors((f) => ({ ...f, level: undefined }));
        }}
        required={requireLevel}
        note="A starting point only — their level comes from the court."
        error={fieldErrors.level}
      />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <LiveStatus message={busy ? "Adding them to your account…" : ""} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className={`min-h-[44px] rounded-full bg-[#B4E655] px-5 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80 ${FOCUS_RING}`}
        >
          {busy ? "Adding…" : "Add them"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`min-h-[44px] rounded-full bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/15 ${FOCUS_RING}`}
        >
          Cancel
        </button>
      </div>
    </fieldset>
  );
}

// ─── Guest block (signed out) ─────────────────────────────────────────────────

function GuestBlock({
  guest,
  index,
  removable,
  requireLevel,
  onChange,
  onRemove,
  title,
  relationships = RELATIONSHIPS,
  errors,
}: {
  guest: GuestParticipant;
  index: number;
  removable: boolean;
  requireLevel: boolean;
  onChange: (next: GuestParticipant) => void;
  onRemove: () => void;
  /** Heading; defaults to "Player" / "Player N". */
  title?: string;
  /** The relationships on offer; a signed-in add never offers "Myself". */
  relationships?: readonly Relationship[];
  /** Problems to show, keyed by field id (householdIssues). */
  errors?: Record<string, string>;
}) {
  const id = `guest-${guest.key}`;
  const heading = title ?? guestTitle(index, false);
  const self = guest.relationship === "self";
  const nameId = householdFieldIds.guestName(guest.key);
  const levelId = householdFieldIds.guestLevel(guest.key);
  return (
    // One player per fieldset, named by its legend (audit M19, WCAG 1.3.1).
    <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <legend className="sr-only">{heading}</legend>
      <div className="flex items-center justify-between gap-3">
        <p aria-hidden="true" className="text-sm font-semibold text-white">
          {heading}
        </p>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className={`-mr-2 inline-flex min-h-[44px] items-center rounded-full px-2 text-sm text-white/70 underline-offset-2 transition hover:text-white hover:underline ${FOCUS_RING}`}
          >
            Remove<span className="sr-only"> {heading}</span>
          </button>
        )}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={nameId} className={LABEL_CLASS}>
          Full name
        </label>
        <input
          id={nameId}
          type="text"
          autoComplete={index === 0 && self ? "name" : "off"}
          value={guest.name}
          onChange={(e) => onChange({ ...guest, name: e.target.value })}
          placeholder={self ? "Your name" : "Their name"}
          required
          className={inputClass}
          {...fieldA11y(nameId, { error: errors?.[nameId] })}
        />
        <FieldError fieldId={nameId} message={errors?.[nameId]} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-rel`} className={LABEL_CLASS}>
          Who is this?
        </label>
        <select
          id={`${id}-rel`}
          value={guest.relationship}
          onChange={(e) => {
            const relationship = e.target.value as Relationship;
            const ageBand = defaultAgeBand(relationship);
            onChange({
              ...guest,
              relationship,
              ageBand,
              isMinor: ageBandIsMinor(ageBand),
            });
          }}
          className={inputClass}
        >
          {relationships.map((r) => (
            <option key={r} value={r} className="bg-[#061427]">
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <AgeBandField
        id={`${id}-age`}
        value={guest.ageBand}
        onChange={(ageBand) =>
          onChange({ ...guest, ageBand, isMinor: ageBandIsMinor(ageBand) })
        }
        label={
          guest.relationship === "self"
            ? "How old are you?"
            : "How old are they?"
        }
      />
      <SelfLevelField
        id={levelId}
        value={guest.selfLevel}
        onChange={(selfLevel) => onChange({ ...guest, selfLevel })}
        required={requireLevel}
        self={self}
        label={self ? "Where's your game right now?" : "Where's their game right now?"}
        error={errors?.[levelId]}
      />
    </fieldset>
  );
}

// ─── The chooser ──────────────────────────────────────────────────────────────

export function WhoIsThisFor({
  household,
  value,
  onChange,
  multiple = false,
  collectProfile = false,
  addInline = false,
  intro,
  errors,
}: {
  household: Household;
  value: HouseholdValue;
  onChange: (next: HouseholdValue) => void;
  /** Enroll and the quiz take several people at once; a booking is one slot. */
  multiple?: boolean;
  /**
   * The quiz places each person off their age band and self-estimate, so it
   * asks both here and requires an answer (backlog #14). Booking and enroll
   * only need to know who the form is about, so they leave this off.
   */
  collectProfile?: boolean;
  /**
   * Signed in, "Add someone" is a typed block sent with the form (as
   * `participants`) and created by the route under the session's account
   * (backlog #24) — instead of "Add a person", which saves at once. The quiz
   * uses it; booking and enroll keep the immediate save.
   */
  addInline?: boolean;
  intro?: string;
  /**
   * Problems to show, keyed by field id: the form passes
   * issuesById(householdIssues(…)) once its primary button has been pressed.
   */
  errors?: Record<string, string>;
}) {
  const { loading, signedIn, participants, reload } = household;
  const [adding, setAdding] = useState(false);
  // After "+ Add someone", focus lands on the new block's name field so a
  // keyboard or screen-reader user is not left on a button that just moved.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`guest-${focusKey}-name`)?.focus();
    setFocusKey(null);
  }, [focusKey]);

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
    return (
      <p role="status" className="text-sm text-white/60">
        Loading who&apos;s on your account…
      </p>
    );
  }

  if (signedIn) {
    function setProfile(id: string, profile: ParticipantProfile) {
      onChange({ ...value, profiles: { ...(value.profiles ?? {}), [id]: profile } });
    }

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

    const chooseError = errors?.[householdFieldIds.choose];
    return (
      <div className="space-y-3">
        {intro && <p className="text-sm text-white/70">{intro}</p>}
        <div className="grid gap-2">
          {participants.map((p, i) => {
            const selected = value.selectedIds.includes(p.id);
            const profile = value.profiles?.[p.id] ?? {
              ageBand: participantAgeBand(p),
              selfLevel: "",
            };
            return (
              <div key={p.id} className="grid gap-2">
                <button
                  type="button"
                  // The first card takes focus when nobody is chosen yet.
                  id={i === 0 ? householdFieldIds.choose : undefined}
                  onClick={() => toggle(p.id)}
                  aria-pressed={selected}
                  {...(i === 0 ? fieldA11y(householdFieldIds.choose, { error: chooseError }) : {})}
                  className={[
                    "flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                    FOCUS_RING,
                    selected
                      ? "border-[#B4E655]/60 bg-[#B4E655]/10"
                      : "border-white/15 bg-white/5 hover:bg-white/10",
                  ].join(" ")}
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-white">
                      {labelName(p)}
                    </span>
                    <span className="block text-xs text-white/60">
                      {relationshipNote(p)}
                    </span>
                  </span>
                  {/* The state shows as a tick as well as colour (WCAG 1.4.1). */}
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center border text-xs font-bold",
                      multiple ? "rounded-sm" : "rounded-full",
                      selected
                        ? "border-[#B4E655] bg-[#B4E655] text-[#061427]"
                        : "border-white/45",
                    ].join(" ")}
                  >
                    {selected ? "✓" : ""}
                  </span>
                </button>
                {collectProfile && selected && (
                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <AgeBandField
                      id={`participant-${p.id}-age`}
                      value={profile.ageBand}
                      onChange={(ageBand) => setProfile(p.id, { ...profile, ageBand })}
                      label={
                        p.relationship === "self"
                          ? "How old are you?"
                          : `How old is ${labelName(p)}?`
                      }
                    />
                    <SelfLevelField
                      id={householdFieldIds.participantLevel(p.id)}
                      value={profile.selfLevel}
                      onChange={(selfLevel) =>
                        setProfile(p.id, { ...profile, selfLevel })
                      }
                      required
                      self={p.relationship === "self"}
                      error={errors?.[householdFieldIds.participantLevel(p.id)]}
                      label={
                        p.relationship === "self"
                          ? "Where's your game right now?"
                          : "Where's their game right now?"
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <FieldError fieldId={householdFieldIds.choose} message={chooseError} />

        {addInline ? (
          <>
            {addedGuests(value).map((g, i) => (
              <GuestBlock
                key={g.key}
                guest={g}
                index={i}
                title={guestTitle(i, true)}
                relationships={RELATIONSHIPS.filter((r) => r !== "self")}
                removable
                requireLevel={collectProfile}
                errors={errors}
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
            {(multiple || householdCount(value, true) === 0) && (
              <button
                type="button"
                onClick={() => {
                  const guest = emptyGuest("child");
                  onChange({ ...value, guests: [...value.guests, guest] });
                  setFocusKey(guest.key);
                }}
                className={`min-h-[44px] w-full rounded-2xl border border-dashed border-white/35 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-[#B4E655]/50 hover:text-white ${FOCUS_RING}`}
              >
                + Add someone
              </button>
            )}
            {multiple && participants.some((p) => p.relationship === "self") && (
              <p className="text-xs text-white/60">
                If this quiz is only for your child, untick yourself.
              </p>
            )}
          </>
        ) : adding ? (
          <AddPersonForm
            requireLevel={collectProfile}
            onAdded={(p, profile) => {
              setAdding(false);
              reload();
              onChange({
                ...value,
                selectedIds: multiple ? [...value.selectedIds, p.id] : [p.id],
                profiles: { ...(value.profiles ?? {}), [p.id]: profile },
              });
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`min-h-[44px] w-full rounded-2xl border border-dashed border-white/35 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-[#B4E655]/50 hover:text-white ${FOCUS_RING}`}
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
      {intro && <p className="text-sm text-white/70">{intro}</p>}
      {value.guests.map((g, i) => (
        <GuestBlock
          key={g.key}
          guest={g}
          index={i}
          removable={value.guests.length > 1}
          requireLevel={collectProfile}
          errors={errors}
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
          onClick={() => {
            // Focus follows the new block (audit M18), as it does signed in.
            const guest = emptyGuest("child");
            onChange({ ...value, guests: [...value.guests, guest] });
            setFocusKey(guest.key);
          }}
          className={`min-h-[44px] w-full rounded-2xl border border-dashed border-white/35 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-[#B4E655]/50 hover:text-white ${FOCUS_RING}`}
        >
          + Add another person
        </button>
      )}
    </div>
  );
}

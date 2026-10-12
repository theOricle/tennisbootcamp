"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  ageBandIsMinor,
  type AgeBand,
} from "@/lib/ageBand";
import { SELF_LEVELS, provisionalTierFor } from "@/lib/level";
import { formatTierLevel } from "@/lib/tiers";
import { TierLine } from "@/components/tiers";
import { withHumanFallback, type FieldIssue } from "@/lib/formValidation";
import { PARTICIPANT_CAP_ERROR } from "@/lib/participantInput";
import { accountAtCap, matchingPlayer, reusedPlayerNote } from "@/lib/enrollPlayers";
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

export function isRelationshipValue(x: unknown): x is Relationship {
  return typeof x === "string" && (RELATIONSHIPS as readonly string[]).includes(x);
}

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
  /**
   * The age band this player last answered (migration 0009, audit M31), or
   * null/absent when never asked — the chooser then assumes from `isMinor`.
   */
  ageBand?: AgeBand | null;
  /**
   * Their own self-estimate from the quiz or a booking (migration 0009), so
   * a player the coach has not levelled yet shows a provisional tier
   * (owner, 2026-10-12). Null/absent when never asked.
   */
  selfLevel?: string | null;
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

/**
 * The band a saved participant starts on: the one they last answered
 * (migration 0009, audit M31), so a returning parent's 15-year-old is not
 * reset to Junior. Before 0009, or for someone never asked, only `isMinor`
 * is known — assume the youngest.
 */
function participantAgeBand(p: ParticipantOption): AgeBand {
  if (p.ageBand) return p.ageBand;
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

/**
 * Age band select — the one place a player's age is asked. `error` is the
 * enroll wizard's: a band outside the group's ages stops the step here, with
 * the right group a link away (owner, 2026-10-12).
 */
function AgeBandField({
  id,
  value,
  onChange,
  label = "How old are they?",
  error,
}: {
  id: string;
  value: AgeBand;
  onChange: (next: AgeBand) => void;
  label?: string;
  error?: string | null;
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
        {...fieldA11y(id, { error })}
      >
        {AGE_BANDS.map((b) => (
          <option key={b} value={b} className="bg-[#061427]">
            {AGE_BAND_LABELS[b]}
          </option>
        ))}
      </select>
      <FieldError fieldId={id} message={error} />
    </div>
  );
}

/**
 * The quiz's hint under the self-estimate (audit M17; design specs §3.7):
 * once an answer maps to a provisional tier (owner D4), a provisional rail
 * and "Likely tier: Novice. Our coaches confirm it on court in week one." (the
 * same moment the quiz result names). "Not sure" and "Prefer not to say" show
 * nothing. Polite live region, so a screen-reader user hears the tier change
 * without leaving the select.
 */
function LikelyTierHint({ value }: { value: string }) {
  const tier = provisionalTierFor(value);
  return (
    <div aria-live="polite" className="min-w-0">
      {tier && (
        <div className="mt-1">
          <TierLine variant="rail" size="sm" level={tier.id} provisional labels="none" />
          <p className={`${HINT_CLASS} mt-2`}>
            Likely tier: <span className="font-semibold text-white">{tier.name}</span>. Our
            coaches confirm it on court in week one.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Self-estimate select. Optional unless the form places off the answer. The
 * options speak to whoever answers (audit M18): "I can rally" for yourself,
 * "They can rally" for a child or partner. `tierHint` (the quiz only) shows
 * the answer's provisional tier under the select.
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
  tierHint = false,
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
  /** Show the answer's provisional tier (the quiz places off this answer). */
  tierHint?: boolean;
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
      {tierHint && <LikelyTierHint value={value} />}
      <FieldError fieldId={id} message={error} />
    </div>
  );
}

function labelName(p: ParticipantOption): string {
  return p.name?.trim() || "Unnamed player";
}

/**
 * The line under a player's name: who they are to the holder, their age
 * group, and their level — "Novice · 2.5" from the coach, "Provisional:
 * Novice" from the quiz until the coach confirms it on court in week one
 * (owner, 2026-10-12), or the one no-level word.
 */
function relationshipNote(p: ParticipantOption): string {
  const rel = (RELATIONSHIPS as readonly string[]).includes(p.relationship)
    ? RELATIONSHIP_LABELS[p.relationship as Relationship]
    : "";
  const age = p.ageBand ? AGE_BAND_LABELS[p.ageBand] : p.isMinor ? "Under 18" : "";
  const provisional = p.level == null ? provisionalTierFor(p.selfLevel) : null;
  const level =
    p.level != null
      ? formatTierLevel(p.level)
      : provisional
        ? `Provisional: ${provisional.name}`
        : "Unranked";
  return [rel, age, level].filter(Boolean).join(" · ");
}

// ─── New player (signed in) ───────────────────────────────────────────────────

function AddPersonForm({
  onAdded,
  onCancel,
  requireLevel,
  participants,
}: {
  onAdded: (p: ParticipantOption, profile: ParticipantProfile, note?: string) => void;
  onCancel: () => void;
  requireLevel: boolean;
  /** Everyone already on the account, so a typed twin is picked, not added. */
  participants: readonly ParticipantOption[];
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
    // A name already on the account is that player (owner, 2026-10-12: reuse,
    // and say so) — no request, no twin.
    const twin = matchingPlayer(participants, fullName);
    if (twin) {
      onAdded(twin, { ageBand: twin.ageBand ?? ageBand, selfLevel }, reusedPlayerNote(twin.name ?? fullName));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), relationship, isMinor, ageBand }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(withHumanFallback(data.error ?? "We couldn't add that person. Try again."));
        return;
      }
      const added = data.participant as ParticipantOption;
      onAdded(
        added,
        { ageBand, selfLevel },
        data.reused ? reusedPlayerNote(added.name ?? fullName) : undefined
      );
    } catch {
      setError(withHumanFallback("We couldn't reach the server. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-[#B4E655]/25 bg-[#B4E655]/5 p-4">
      <legend className="sr-only">New player</legend>
      <p aria-hidden="true" className="text-sm font-semibold text-white">
        New player
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
        note="A starting point only — our coaches set their level."
        error={fieldErrors.level}
        tierHint={requireLevel}
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
        error={errors?.[`${id}-age`]}
      />
      <SelfLevelField
        id={levelId}
        value={guest.selfLevel}
        onChange={(selfLevel) => onChange({ ...guest, selfLevel })}
        required={requireLevel}
        self={self}
        label={self ? "Where's your game right now?" : "Where's their game right now?"}
        error={errors?.[levelId]}
        tierHint={requireLevel}
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
  eligibleIds = null,
  disabledReasons,
  lockedIds,
  signInHref = null,
}: {
  household: Household;
  value: HouseholdValue;
  onChange: (next: HouseholdValue) => void;
  /**
   * Enroll on a tier-gated private cohort the holder reached by level (audit
   * M27): only these players are inside the band and can be picked; the
   * others show, greyed, with the reason. Null offers everyone.
   */
  eligibleIds?: readonly string[] | null;
  /**
   * Players who cannot be picked here, each with the reason shown on their
   * row (owner, 2026-10-12): already enrolled or invited in this cohort,
   * outside the group's ages, or not the player an invitation names.
   */
  disabledReasons?: Record<string, string>;
  /**
   * Players an invitation names: picked from the start and never unticked.
   * Nobody else can be added alongside them.
   */
  lockedIds?: readonly string[];
  /**
   * Signed out: the quiet "Have an account? Sign in to choose your player"
   * line under the typed blocks (owner, 2026-10-12). The guest path stays
   * the one in front — no sign-in wall; the link brings a returning holder
   * back to this page.
   */
  signInHref?: string | null;
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
  // "Maya is already on your account, so we picked them." after a typed twin.
  const [reusedNote, setReusedNote] = useState<string | null>(null);
  // After "+ Add someone", focus lands on the new block's name field so a
  // keyboard or screen-reader user is not left on a button that just moved.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`guest-${focusKey}-name`)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const reasonFor = (id: string): string | null => {
    if (disabledReasons?.[id]) return disabledReasons[id];
    if (eligibleIds && !eligibleIds.includes(id)) return "Outside this group's level band";
    return null;
  };
  const canPick = (id: string) => reasonFor(id) === null;
  const locked = (id: string) => Boolean(lockedIds?.includes(id));

  // Default the selection to the player an invitation names, else the holder
  // themselves once we know who they are (or, on a level-gated group, the
  // first player inside its band).
  useEffect(() => {
    if (!signedIn || participants.length === 0) return;
    if (value.selectedIds.length > 0) return;
    const pickable = participants.filter((p) => canPick(p.id));
    const first =
      pickable.find((p) => locked(p.id)) ??
      pickable.find((p) => p.relationship === "self") ??
      pickable[0];
    if (!first) return;
    onChange({ ...value, selectedIds: [first.id] });
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
      if (!canPick(id)) return;
      // The invited player stays picked.
      if (locked(id) && value.selectedIds.includes(id)) return;
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
    // Nobody can be added beside an invited player, inside a level band, or
    // past the account's cap (backlog #24) — the cap says so.
    const atCap = accountAtCap(participants.length);
    const canAdd = !eligibleIds && !(lockedIds && lockedIds.length > 0);
    return (
      <div className="space-y-3">
        {intro && <p className="text-sm text-white/70">{intro}</p>}
        <div className="grid gap-2">
          {participants.map((p, i) => {
            const selected = value.selectedIds.includes(p.id);
            const pickable = canPick(p.id);
            const reason = reasonFor(p.id);
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
                  disabled={!pickable}
                  {...(i === 0 ? fieldA11y(householdFieldIds.choose, { error: chooseError }) : {})}
                  className={[
                    "flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                    FOCUS_RING,
                    selected
                      ? "border-[#B4E655]/60 bg-[#B4E655]/10"
                      : pickable
                      ? "border-white/15 bg-white/5 hover:bg-white/10"
                      : "cursor-not-allowed border-white/10 bg-transparent opacity-60",
                  ].join(" ")}
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-white">
                      {labelName(p)}
                    </span>
                    <span className="block text-xs text-white/60">
                      {relationshipNote(p)}
                    </span>
                    {!pickable && reason && (
                      // Brighter than the note above so the reason still
                      // reads at 4.5:1 through the row's opacity-60.
                      <span className="block text-xs text-white/80">{reason}</span>
                    )}
                    {pickable && locked(p.id) && (
                      <span className="block text-xs text-white/80">This invitation is for them</span>
                    )}
                  </span>
                  {/* The state shows as a tick as well as colour (WCAG 1.4.1).
                      A row that can't be picked has no tick box to suggest
                      otherwise. */}
                  {(pickable || selected) && (
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
                  )}
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
                      tierHint
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <FieldError fieldId={householdFieldIds.choose} message={chooseError} />
        <LiveStatus message={reusedNote ?? ""} visible={Boolean(reusedNote)} className="text-sm text-white/75" />

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
        ) : !canAdd ? null : atCap ? (
          // The cap (backlog #24), said before a form is typed into.
          <p className="text-sm text-white/70">{PARTICIPANT_CAP_ERROR}</p>
        ) : adding ? (
          <AddPersonForm
            requireLevel={collectProfile}
            participants={participants}
            onAdded={(p, profile, note) => {
              setAdding(false);
              setReusedNote(note ?? null);
              reload();
              onChange({
                ...value,
                selectedIds: multiple
                  ? Array.from(new Set([...value.selectedIds, p.id]))
                  : [p.id],
                profiles: { ...(value.profiles ?? {}), [p.id]: profile },
              });
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setReusedNote(null);
              setAdding(true);
            }}
            className={`min-h-[44px] w-full rounded-2xl border border-dashed border-white/35 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-[#B4E655]/50 hover:text-white ${FOCUS_RING}`}
          >
            + New player
          </button>
        )}
      </div>
    );
  }

  // Signed out: the account holder's own details live on the contact step of
  // each form; here we collect the people those details are for. A new
  // player is the path in front (owner, 2026-10-12: no sign-in wall); the
  // sign-in line is for a returning holder.
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
      {signInHref && (
        <p className="text-sm text-white/70">
          Have an account?{" "}
          <Link
            href={signInHref}
            className={`rounded font-semibold text-[#B4E655] underline-offset-2 hover:underline ${FOCUS_RING}`}
          >
            Sign in to choose your player →
          </Link>
        </p>
      )}
    </div>
  );
}

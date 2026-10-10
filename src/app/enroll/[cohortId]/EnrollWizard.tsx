"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Cohort } from "@/types/cohort";
import type { Program } from "@/types/program";
import { formatDateRange, formatDaysTimes, formatCohortPrice } from "@/lib/cohorts";
import { VENUE_LINE } from "@/lib/membership";
import { COOLING_OFF_DAYS } from "@/content/policies";
import { trackEvent, trackEnrollStart } from "@/lib/analytics";
import { TierRangeBadges } from "@/components/tiers";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { artFocusForCohort } from "@/lib/plates/variant";
import { amountDueCents, etransferMemo } from "@/lib/paymentTransitions";
import {
  WhoIsThisFor,
  useHousehold,
  EMPTY_HOUSEHOLD,
  householdIssues,
  type HouseholdValue,
} from "@/components/participants/WhoIsThisFor";
import {
  FIELD_MESSAGES,
  emailError,
  firstIssueId,
  issuesById,
  phoneError,
  requiredError,
  withHumanFallback,
  type FieldIssue,
} from "@/lib/formValidation";
import { useFocusOnChange } from "@/lib/useFocusOnChange";
import {
  FieldError,
  FormAlert,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  errorIdFor,
  fieldA11y,
  hintIdFor,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";
import { TEXT_LINK_MUTED, TextLink } from "@/components/ui/TextLink";

// ─── Constants ────────────────────────────────────────────────────────────────

const WAIVER_VERSION = "v0-placeholder-2026-05-24";
const COOLING_OFF_COPY = `Cancel for any reason within ${COOLING_OFF_DAYS} days for a full refund. The ${COOLING_OFF_DAYS} days run from the later of receiving your written agreement and your first session.`;
// 0: summary  1: who is this for  2: registrant  3: consent
// (4: e-transfer instructions — only on cohorts whose payment_mode is
// 'etransfer'; card cohorts go straight to Stripe Checkout after consent,
// exactly as before.)
const CARD_STEPS = 4;
const ETRANSFER_STEPS = 5;

/** Server-derived facts for the e-transfer step (null on card cohorts). */
export type EtransferInfo = {
  recipientEmail: string;
  creditCents: number; // unused assessment credit that comes off the price
};

function moneyCAD(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function computeAge(dob: string): number | null {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const value = Math.round((step / total) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Enrollment progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={`Step ${step} of ${total}`}
      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
    >
      <div
        className="h-full rounded-full bg-[#B4E655] motion-safe:transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** One labelled field with its problem underneath (audit M19). */
function FieldGroup({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintIdFor(id)} className={HINT_CLASS}>
          {hint}
        </p>
      )}
      <FieldError fieldId={id} message={error} />
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  autoComplete,
  inputMode,
  error,
  hint = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  error?: string;
  hint?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      inputMode={inputMode}
      className={INPUT_CLASS}
      {...fieldA11y(id, { error, hint })}
    />
  );
}

/** Field ids, so a press of Continue can focus the first problem. */
const FIELD_IDS = {
  player: (key: string) => `enroll-player-${key}`,
  dob: (key: string) => `enroll-dob-${key}`,
  email: "enroll-email",
  phone: "enroll-phone",
  guardianName: "enroll-guardian-name",
  guardianEmail: "enroll-guardian-email",
  guardianPhone: "enroll-guardian-phone",
  consent: "enroll-consent",
  signature: "enroll-signature",
} as const;

// ─── Form state ───────────────────────────────────────────────────────────────

/** One seat: a player, their date of birth, and where the row came from. */
export type EnrollPlayer = {
  key: string;
  name: string;
  dob: string;
  participantId: string | null;
  relationship: string;
  isMinor: boolean;
};

type FormState = {
  participantName: string;
  participantDob: string;
  contactEmail: string;
  contactPhone: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  consentChecked: boolean;
  consentSignedName: string;
};

const EMPTY_FORM: FormState = {
  participantName: "",
  participantDob: "",
  contactEmail: "",
  contactPhone: "",
  guardianName: "",
  guardianEmail: "",
  guardianPhone: "",
  consentChecked: false,
  consentSignedName: "",
};

// ─── Step renderers ───────────────────────────────────────────────────────────

function OrderSummary({
  cohort,
  program,
  seatsRemaining,
}: {
  cohort: Cohort;
  program: Program | undefined;
  seatsRemaining: number | null;
}) {
  const price = formatCohortPrice(cohort);
  return (
    <div className="space-y-5">
      {/* The program's Court Plate (design specs §4.8): the strip frame,
          profiled by the cohort's band and side-picked by its id. Visual
          only; nothing below reads it. */}
      {program && (
        <div className="aspect-[3/1] w-full overflow-hidden rounded-xl border border-white/10 bg-[#061427]">
          <ProgramPlate
            plate={program.plate}
            frame="strip"
            density="compact"
            comingSoon={program.comingSoon}
            levelMin={cohort.levelMin}
            levelMax={cohort.levelMax}
            seed={cohort.id}
            focusSlot={artFocusForCohort(program, cohort)}
          />
        </div>
      )}

      {/* Program */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
          {program?.type ?? "Program"}
        </p>
        <p className="mt-0.5 text-xl font-semibold text-white">
          {program?.title ?? cohort.programId}
        </p>
        {program?.ageGroup && (
          <p className="mt-0.5 text-sm text-white/60">{program.ageGroup}</p>
        )}
        <TierRangeBadges
          levelMin={cohort.levelMin}
          levelMax={cohort.levelMax}
          className="mt-2"
        />
      </div>

      <div className="border-t border-white/10" />

      {/* Location */}
      <div className="flex items-start gap-2.5">
        <svg
          aria-hidden="true"
          focusable="false"
          className="mt-0.5 h-4 w-4 shrink-0 text-[#B4E655]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
          />
        </svg>
        <p className="text-sm text-white/70">{VENUE_LINE}</p>
      </div>

      {/* Schedule */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-white/60 uppercase tracking-wide font-semibold">Dates</p>
          <p className="mt-1 text-sm text-[#B4E655]">{formatDateRange(cohort)}</p>
          <p className="mt-0.5 text-xs text-white/60">{cohort.weeks} weeks</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-white/60 uppercase tracking-wide font-semibold">Sessions</p>
          <p className="mt-1 text-sm text-[#B4E655]">{formatDaysTimes(cohort)}</p>
          <p className="mt-0.5 text-xs text-white/60">
            {cohort.capacityMin}–{cohort.capacityMax} players
          </p>
        </div>
      </div>

      {/* Price + availability */}
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/70">Total</p>
          <p className="text-base font-semibold text-white">{price}</p>
        </div>
        {cohort.priceCents === 0 && (
          <p className="mt-1 text-xs text-white/60">
            Price will be confirmed before payment is collected.
          </p>
        )}
        {cohort.priceCents > 0 && (
          <p className="mt-1 text-xs text-white/60">
            Completed your $20 assessment? It comes off this price automatically
            at payment.
          </p>
        )}
        {seatsRemaining !== null && seatsRemaining <= 3 && (
          <p className="mt-2 text-xs font-medium text-yellow-200">
            Only {seatsRemaining} spot{seatsRemaining === 1 ? "" : "s"} left
          </p>
        )}
      </div>

      {/* Refund reassurance */}
      <p className="text-xs text-white/60">
        {COOLING_OFF_COPY}{" "}
        <Link
          href="/legal/refund-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#B4E655] underline-offset-2 hover:underline"
        >
          Program Policies
        </Link>
      </p>
    </div>
  );
}

function RegistrantStep({
  form,
  setForm,
  players,
  setPlayers,
  isMinor,
  signedIn,
  accountEmail,
  cohortId,
  onEnterSubmit,
  errors,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  players: EnrollPlayer[];
  setPlayers: (next: EnrollPlayer[]) => void;
  isMinor: boolean;
  signedIn: boolean;
  accountEmail: string;
  cohortId: string;
  onEnterSubmit: () => void;
  errors: Record<string, string>;
}) {
  return (
    // An explicit action keeps the invite token out of GA's form_destination
    // (an action-less form reports the full URL); onSubmit still prevents submission.
    <form
      noValidate
      action={`/enroll/${cohortId}`}
      onSubmit={(e) => {
        e.preventDefault();
        onEnterSubmit();
      }}
      className="space-y-5"
    >
      {/* One block per player — a seat each, each its own fieldset (audit M19). */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-white">
          {players.length > 1 ? "Players" : "Player"}
        </p>
        {players.map((player) => (
          <fieldset
            key={player.key}
            // A chosen player with no name on file is flagged on the block
            // itself, which takes focus when Continue is pressed.
            id={FIELD_IDS.player(player.key)}
            tabIndex={-1}
            aria-describedby={
              errors[FIELD_IDS.player(player.key)]
                ? errorIdFor(FIELD_IDS.player(player.key))
                : undefined
            }
            className={cn(
              "space-y-3 rounded-2xl border bg-white/5 p-4",
              errors[FIELD_IDS.player(player.key)] ? "border-red-400" : "border-white/10",
              FOCUS_RING
            )}
          >
            <legend className="sr-only">{player.name || "This player"}</legend>
            <p aria-hidden="true" className="text-sm font-semibold text-[#B4E655]">
              {player.name || "This player"}
            </p>
            <FieldError
              fieldId={FIELD_IDS.player(player.key)}
              message={errors[FIELD_IDS.player(player.key)]}
            />
            <FieldGroup
              id={FIELD_IDS.dob(player.key)}
              label="Date of birth"
              error={errors[FIELD_IDS.dob(player.key)]}
            >
              <TextInput
                id={FIELD_IDS.dob(player.key)}
                type="date"
                value={player.dob}
                onChange={(v) =>
                  setPlayers(
                    players.map((p) =>
                      p.key === player.key ? { ...p, dob: v } : p
                    )
                  )
                }
                required
                error={errors[FIELD_IDS.dob(player.key)]}
              />
            </FieldGroup>
          </fieldset>
        ))}
      </div>

      {/* Account holder — the payer, and the guardian for anyone under 18. */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-white">Account holder</legend>
        <div className="space-y-3">
          {signedIn ? (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              Enrolling on your account —{" "}
              <span className="font-semibold text-white">{accountEmail}</span>.
            </p>
          ) : (
            <FieldGroup id={FIELD_IDS.email} label="Email" error={errors[FIELD_IDS.email]}>
              <TextInput
                id={FIELD_IDS.email}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.contactEmail}
                onChange={(v) => setForm((s) => ({ ...s, contactEmail: v }))}
                placeholder="email@example.com"
                required
                error={errors[FIELD_IDS.email]}
              />
            </FieldGroup>
          )}
          <FieldGroup id={FIELD_IDS.phone} label="Phone" error={errors[FIELD_IDS.phone]}>
            <TextInput
              id={FIELD_IDS.phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.contactPhone}
              onChange={(v) => setForm((s) => ({ ...s, contactPhone: v }))}
              placeholder="(647) 555-1234"
              required
              error={errors[FIELD_IDS.phone]}
            />
          </FieldGroup>
        </div>
      </fieldset>

      {/* Guardian section — shown when any player is under 18 */}
      {isMinor && (
        <fieldset className="rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-5 py-4">
          <legend className="sr-only">Parent or guardian</legend>
          <p aria-hidden="true" className="mb-1 text-sm font-semibold text-[#B4E655]">Parent / Guardian</p>
          <p className="mb-3 text-xs text-white/70">
            The guardian is the account holder and will sign the waiver for
            every player under 18.
          </p>
          <div className="space-y-3">
            <FieldGroup id={FIELD_IDS.guardianName} label="Full name" error={errors[FIELD_IDS.guardianName]}>
              <TextInput
                id={FIELD_IDS.guardianName}
                autoComplete="name"
                value={form.guardianName}
                onChange={(v) => setForm((s) => ({ ...s, guardianName: v }))}
                placeholder="Guardian's full name"
                required
                error={errors[FIELD_IDS.guardianName]}
              />
            </FieldGroup>
            <FieldGroup id={FIELD_IDS.guardianEmail} label="Email" error={errors[FIELD_IDS.guardianEmail]}>
              <TextInput
                id={FIELD_IDS.guardianEmail}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.guardianEmail}
                onChange={(v) => setForm((s) => ({ ...s, guardianEmail: v }))}
                placeholder="guardian@example.com"
                required
                error={errors[FIELD_IDS.guardianEmail]}
              />
            </FieldGroup>
            <FieldGroup id={FIELD_IDS.guardianPhone} label="Phone" error={errors[FIELD_IDS.guardianPhone]}>
              <TextInput
                id={FIELD_IDS.guardianPhone}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.guardianPhone}
                onChange={(v) => setForm((s) => ({ ...s, guardianPhone: v }))}
                placeholder="(647) 555-1234"
                required
                error={errors[FIELD_IDS.guardianPhone]}
              />
            </FieldGroup>
          </div>
        </fieldset>
      )}
      {/* Enables Enter-to-advance from any field; the visible CTA lives in the footer */}
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
        Continue
      </button>
    </form>
  );
}

function ConsentStep({
  form,
  setForm,
  isMinor,
  errors,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  isMinor: boolean;
  errors: Record<string, string>;
}) {
  const signerLabel = isMinor ? "guardian" : "participant";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-white/70 leading-relaxed">
          Before we can process payment, {isMinor ? "the guardian" : "you"} must read and
          agree to the Terms &amp; Liability Waiver and Program Policies.
        </p>
        <p className="mt-2 text-xs text-white/60">
          How we handle your information:{" "}
          <Link
            href="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#B4E655] underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
        </p>
      </div>

      {/* Checkbox */}
      <div className="grid gap-1.5">
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
            form.consentChecked
              ? "border-[#B4E655]/40 bg-[#B4E655]/5"
              : errors[FIELD_IDS.consent]
                ? "border-red-400 bg-white/5"
                : "border-white/35 bg-white/5"
          )}
        >
          <input
            id={FIELD_IDS.consent}
            type="checkbox"
            required
            checked={form.consentChecked}
            onChange={(e) => setForm((s) => ({ ...s, consentChecked: e.target.checked }))}
            className={`mt-0.5 h-4 w-4 shrink-0 accent-[#B4E655] ${FOCUS_RING}`}
            {...fieldA11y(FIELD_IDS.consent, { error: errors[FIELD_IDS.consent] })}
          />
          <span className="text-sm text-white/80">
            I have read and agree to the{" "}
            <Link
              href="/legal/waiver"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#B4E655] underline-offset-2 hover:underline"
            >
              Terms &amp; Liability Waiver
            </Link>{" "}
            and{" "}
            <Link
              href="/legal/refund-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#B4E655] underline-offset-2 hover:underline"
            >
              Program Policies
            </Link>
            {isMinor && (
              <span className="ml-1 text-white/70">
                (guardian agrees on behalf of the minor participant)
              </span>
            )}
          </span>
        </label>
        <FieldError fieldId={FIELD_IDS.consent} message={errors[FIELD_IDS.consent]} />
      </div>

      {/* Typed-name signature */}
      <FieldGroup
        id={FIELD_IDS.signature}
        label={`Type your full name to sign (${signerLabel})`}
        hint="By typing your name above you are providing an electronic signature."
        error={errors[FIELD_IDS.signature]}
      >
        <TextInput
          id={FIELD_IDS.signature}
          autoComplete="name"
          value={form.consentSignedName}
          onChange={(v) => setForm((s) => ({ ...s, consentSignedName: v }))}
          placeholder={`${isMinor ? "Guardian's" : "Your"} full name`}
          required
          error={errors[FIELD_IDS.signature]}
          hint
        />
      </FieldGroup>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the value is visible and selectable anyway.
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className={`min-h-[44px] shrink-0 rounded-full border border-white/35 px-4 text-sm font-semibold text-white/80 transition hover:border-[#B4E655]/50 hover:text-white ${FOCUS_RING}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {/* The change of words is announced, not only shown (audit M19). */}
      <LiveStatus message={copied ? `${label[0].toUpperCase()}${label.slice(1)} copied` : ""} />
    </>
  );
}

function EtransferStep({
  cohort,
  info,
  memo,
  seats,
  submitting,
  onPayByCard,
}: {
  cohort: Cohort;
  info: EtransferInfo;
  memo: string;
  /** How many players this transfer covers — one seat each. */
  seats: number;
  submitting: boolean;
  onPayByCard: () => void;
}) {
  const total = cohort.priceCents * seats;
  const due = amountDueCents(total, info.creditCents);
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-white/70">
        Send an Interac e-transfer with the details below. Your spot stays held
        until the coach confirms the transfer arrived. Once it does, you&apos;re
        in, and the confirmation email follows.
      </p>

      <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 text-sm">
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Amount</p>
          <p className="mt-1 text-xl font-semibold text-white">{moneyCAD(due)} CAD</p>
          {(seats > 1 || info.creditCents > 0) && (
            <p className="mt-0.5 text-xs text-white/70">
              {seats > 1
                ? `${moneyCAD(cohort.priceCents)} × ${seats} players`
                : moneyCAD(cohort.priceCents)}
              {info.creditCents > 0
                ? ` − ${moneyCAD(info.creditCents)} assessment credit`
                : ""}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Send to</p>
            <p className="mt-1 break-all font-medium text-[#B4E655]">{info.recipientEmail}</p>
          </div>
          <CopyButton value={info.recipientEmail} label="email address" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Message</p>
            <p className="mt-1 font-medium text-white">{memo}</p>
          </div>
          <CopyButton value={memo} label="message" />
        </div>
      </div>

      <p className="text-xs text-white/70">
        Put the message on the transfer exactly as shown — it&apos;s how we match
        your payment to your spot. We&apos;ve also emailed you these details.
      </p>

      <button
        type="button"
        onClick={onPayByCard}
        disabled={submitting}
        className={`${TEXT_LINK_MUTED} underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-white/30`}
      >
        Prefer to pay by card? Pay by card instead
      </button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const STEP_TITLES = [
  "Review your enrollment",
  "Who is this for?",
  "Registrant details",
  "Terms & waiver",
  "Send your e-transfer",
];

const STEP_SUBTITLES = [
  "Confirm what you're signing up for before we collect your details.",
  "One seat per player. Enrolling two people takes two seats and one payment.",
  "A date of birth for each player, and where to reach you. Anyone under 18 needs a parent or guardian.",
  "Read and agree to the waiver, then sign with your full name.",
  "Your spot is held while the coach confirms the transfer arrived.",
];

export function EnrollWizard({
  cohort,
  program,
  seatsRemaining,
  inviteToken = null,
  initialEmail = null,
  etransfer = null,
}: {
  cohort: Cohort;
  program: Program | undefined;
  seatsRemaining: number | null;
  inviteToken?: string | null;
  initialEmail?: string | null;
  etransfer?: EtransferInfo | null;
}) {
  const totalSteps = etransfer ? ETRANSFER_STEPS : CARD_STEPS;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    contactEmail: initialEmail ?? "",
  });

  // Who is this for? (backlog #11) One seat per player, one payment.
  const household = useHousehold();
  const [who, setWho] = useState<HouseholdValue>(EMPTY_HOUSEHOLD);
  const [dobs, setDobs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Field ids whose problems are on screen, added when Continue is pressed
  // (audit M19); the list under the button follows the same press.
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [pressedWithGaps, setPressedWithGaps] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Continue and Back land on the new step's heading (audit M19).
  useFocusOnChange(headingRef, step);
  // The Sheet row written by /api/enroll, kept so the e-transfer step can
  // offer card checkout (or re-send) without appending a second row.
  const [saved, setSaved] = useState<{
    rowNumber: number | null;
    consentAgreedAt: string;
  } | null>(null);
  // Sheet row per player, so the e-transfer step and the credit write can
  // address each seat without appending a second set of rows.
  const [savedRows, setSavedRows] = useState<Record<string, number>>({});

  useEffect(() => {
    trackEnrollStart(cohort.id, program?.title ?? cohort.programId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The seats this enrollment covers, derived from the chooser. Signed in
  // that's the picked participants; signed out it's the typed blocks.
  const players: EnrollPlayer[] = household.signedIn
    ? who.selectedIds.map((id) => {
        const p = household.participants.find((x) => x.id === id);
        return {
          key: id,
          name: p?.name?.trim() ?? "",
          dob: dobs[id] ?? "",
          participantId: id,
          relationship: p?.relationship ?? "self",
          isMinor: p?.isMinor === true,
        };
      })
    : who.guests
        .filter((g) => g.name.trim())
        .map((g) => ({
          key: g.key,
          name: g.name.trim(),
          dob: dobs[g.key] ?? "",
          participantId: null,
          relationship: g.relationship,
          isMinor: g.isMinor,
        }));

  function setPlayers(next: EnrollPlayer[]) {
    setDobs((prev) => {
      const out = { ...prev };
      for (const p of next) out[p.key] = p.dob;
      return out;
    });
  }

  // Anyone under 18 puts the guardian block on screen and the guardian's
  // signature on the waiver.
  const isMinor = players.some(
    (p) => p.isMinor || ((a) => a !== null && a < 18)(computeAge(p.dob))
  );
  /** What stops the current step, one issue per field, in screen order. */
  function stepIssues(): FieldIssue[] {
    if (step === 1) {
      return householdIssues(who, household.signedIn, household.participants);
    }
    if (step === 2) {
      const out: FieldIssue[] = [];
      for (const p of players) {
        // A signed-in participant can have no stored name ("Unnamed player"
        // on the dashboard); /api/enroll must never get a blank name.
        if (!p.name.trim()) {
          out.push({ id: FIELD_IDS.player(p.key), message: FIELD_MESSAGES.playerNameMissing });
        }
        const id = FIELD_IDS.dob(p.key);
        if (!p.dob) out.push({ id, message: FIELD_MESSAGES.dobMissing });
        else if (computeAge(p.dob) === null) out.push({ id, message: FIELD_MESSAGES.dobInvalid });
      }
      if (!household.signedIn) {
        const e = emailError(form.contactEmail);
        if (e) out.push({ id: FIELD_IDS.email, message: e });
      }
      const ph = phoneError(form.contactPhone);
      if (ph) out.push({ id: FIELD_IDS.phone, message: ph });
      if (isMinor) {
        const gn = requiredError(form.guardianName, "Add the guardian's full name.");
        if (gn) out.push({ id: FIELD_IDS.guardianName, message: gn });
        const ge = form.guardianEmail.trim()
          ? emailError(form.guardianEmail)
          : "Add the guardian's email address.";
        if (ge) out.push({ id: FIELD_IDS.guardianEmail, message: ge });
        const gp = phoneError(form.guardianPhone);
        if (gp) out.push({ id: FIELD_IDS.guardianPhone, message: gp });
      }
      return out;
    }
    if (step === 3) {
      const out: FieldIssue[] = [];
      if (!form.consentChecked) out.push({ id: FIELD_IDS.consent, message: FIELD_MESSAGES.consentMissing });
      if (!form.consentSignedName.trim()) {
        out.push({ id: FIELD_IDS.signature, message: FIELD_MESSAGES.signatureMissing });
      }
      return out;
    }
    return [];
  }

  const visibleIssues = stepIssues().filter((i) => shown.has(i.id));
  const errors = issuesById(visibleIssues);

  const contactEmail = household.signedIn
    ? household.accountEmail || form.contactEmail
    : form.contactEmail;

  function enrollmentMeta(consentAgreedAt: string) {
    const first = players[0];
    return {
      contactEmail,
      // Kept for anything still reading a single participant.
      participantName: first?.name ?? form.participantName,
      participantDob: first?.dob ?? form.participantDob,
      isMinor,
      contactPhone: form.contactPhone,
      guardianName: isMinor ? form.guardianName : undefined,
      guardianEmail: isMinor ? form.guardianEmail : undefined,
      guardianPhone: isMinor ? form.guardianPhone : undefined,
      consentSignedName: form.consentSignedName,
      consentAgreedAt,
      waiverVersion: WAIVER_VERSION,
      location: cohort.locationId,
      participants: players.map((p) => ({
        name: p.name,
        participantId: p.participantId,
        dob: p.dob,
        isMinor: p.isMinor || ((a) => a !== null && a < 18)(computeAge(p.dob)),
        rowNumber: savedRows[p.key] ?? null,
      })),
    };
  }

  // Step 1 of payment: save the enrollment to Google Sheets (once).
  async function saveEnrollment(): Promise<{ rowNumber: number | null; consentAgreedAt: string }> {
    if (saved) return saved;
    const consentAgreedAt = new Date().toISOString();
    const enrollRes = await fetch("/api/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cohortId: cohort.id,
        inviteToken: inviteToken ?? undefined,
        program: program?.title ?? cohort.programId,
        location: cohort.locationId,
        // One row per player.
        participants: players.map((p) => ({
          name: p.name,
          dob: p.dob,
          isMinor: p.isMinor || ((a) => a !== null && a < 18)(computeAge(p.dob)),
          participantId: p.participantId,
          relationship: p.relationship,
        })),
        participantName: players[0]?.name ?? form.participantName,
        participantDob: players[0]?.dob ?? form.participantDob,
        isMinor,
        accountName: isMinor ? form.guardianName : players[0]?.name ?? "",
        contactEmail,
        contactPhone: form.contactPhone,
        guardianName: isMinor ? form.guardianName : "",
        guardianEmail: isMinor ? form.guardianEmail : "",
        guardianPhone: isMinor ? form.guardianPhone : "",
        consentSignedName: form.consentSignedName,
        consentAgreedAt,
        waiverVersion: WAIVER_VERSION,
      }),
    });
    await throwIfRefused(enrollRes);
    if (!enrollRes.ok) throw new Error("enrollment");
    const enrollData = await enrollRes.json();
    const rows: Record<string, number> = {};
    const returned: { rowNumber: number | null }[] = enrollData.participants ?? [];
    players.forEach((p, i) => {
      const n = returned[i]?.rowNumber;
      if (typeof n === "number") rows[p.key] = n;
    });
    setSavedRows(rows);
    const result = { rowNumber: enrollData.rowNumber ?? null, consentAgreedAt };
    setSaved(result);
    return result;
  }

  // Step 2 of payment (card): create the checkout session and redirect.
  async function goToCheckout(row: { rowNumber: number | null; consentAgreedAt: string }) {
    const checkoutRes = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cohortId: cohort.id,
        programTitle: program?.title ?? cohort.programId,
        priceCents: cohort.priceCents,
        inviteToken: inviteToken ?? undefined,
        enrollmentRowNumber: row.rowNumber,
        enrollmentMeta: enrollmentMeta(row.consentAgreedAt),
      }),
    });
    await throwIfRefused(checkoutRes);
    if (!checkoutRes.ok) throw new Error("checkout");
    const { sessionUrl } = await checkoutRes.json();
    // Redirect to Stripe Checkout or confirmed page (mock)
    window.location.href = sessionUrl;
  }

  /**
   * A route that refused before anything was created (declined invite #34;
   * the invite gate, a full cohort or a mismatched row #38) says why in its
   * JSON. Show that instead of the generic "couldn't reach payment".
   */
  async function throwIfRefused(res: Response) {
    if (res.status !== 400 && res.status !== 403 && res.status !== 409) return;
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) throw new Error(`refused:${body.error}`);
  }

  function reportError(err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("refused:")) {
      // The route's own words, then the info@ fallback (voice.md, errors).
      setSubmitError(withHumanFallback(msg.slice("refused:".length)));
    } else if (msg === "checkout") {
      setSubmitError(
        "Couldn't reach payment — please try again or email info@tennisbootcamp.ca"
      );
    } else if (msg === "etransfer") {
      setSubmitError(
        "Couldn't record your e-transfer — please try again or email info@tennisbootcamp.ca"
      );
    } else {
      setSubmitError(
        "Something went wrong — please try again or email us at info@tennisbootcamp.ca"
      );
    }
  }

  /** Card path — unchanged behaviour: save, then straight to checkout. */
  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    trackEvent("enroll_continue_to_payment", {
      cohort_id: cohort.id,
      program: program?.title ?? cohort.programId,
    });
    try {
      const row = await saveEnrollment();
      await goToCheckout(row);
    } catch (err) {
      reportError(err);
      setSubmitting(false);
    }
  }

  /** E-transfer path: save the enrollment, then show the instructions step. */
  async function continueToEtransfer() {
    setSubmitting(true);
    setSubmitError(null);
    trackEvent("enroll_continue_to_payment", {
      cohort_id: cohort.id,
      program: program?.title ?? cohort.programId,
      payment_method: "etransfer",
    });
    try {
      await saveEnrollment();
      setStep(ETRANSFER_STEPS - 1);
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  }

  /** "I've sent it": flag the invite, email the details, land on the held page. */
  async function sendEtransfer() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const row = await saveEnrollment();
      const res = await fetch("/api/enroll/etransfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: cohort.id,
          programTitle: program?.title ?? cohort.programId,
          inviteToken: inviteToken ?? undefined,
          enrollmentMeta: enrollmentMeta(row.consentAgreedAt),
        }),
      });
      await throwIfRefused(res);
      if (!res.ok) throw new Error("etransfer");

      trackEvent("enroll_etransfer_sent", {
        cohort_id: cohort.id,
        program: program?.title ?? cohort.programId,
      });
      const params = new URLSearchParams({ etransfer: "1" });
      if (row.rowNumber != null) params.set("row", String(row.rowNumber));
      if (inviteToken) params.set("invite", "1");
      window.location.href = `/enroll/${cohort.id}/confirmed?${params.toString()}`;
    } catch (err) {
      reportError(err);
      setSubmitting(false);
    }
  }

  // Continue is always enabled (audit M19): pressing it with gaps shows each
  // problem by its field, lists them under the button and focuses the first.
  function next() {
    if (submitting) return;
    const found = stepIssues();
    if (found.length > 0) {
      setShown((s) => {
        const out = new Set(s);
        for (const i of found) out.add(i.id);
        return out;
      });
      setPressedWithGaps(true);
      const id = firstIssueId(found);
      if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
      return;
    }
    setPressedWithGaps(false);
    if (etransfer) {
      if (step === CARD_STEPS - 1) void continueToEtransfer();
      else if (step === ETRANSFER_STEPS - 1) void sendEtransfer();
      else setStep((s) => s + 1);
      return;
    }
    if (step < CARD_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      void submit();
    }
  }

  const seatCount = Math.max(1, players.length);

  function back() {
    setPressedWithGaps(false);
    setStep((s) => Math.max(s - 1, 0));
  }

  const isLastStep = step === totalSteps - 1;
  const isConsentStep = step === CARD_STEPS - 1;
  const memo = etransferMemo(
    players.map((p) => p.name).filter(Boolean).join(" + ") || form.participantName,
    cohort.label
  );

  let ctaLabel: string;
  if (submitting) {
    ctaLabel = etransfer && isLastStep ? "Sending…" : etransfer && isConsentStep ? "Saving…" : "Redirecting…";
  } else if (etransfer && isLastStep) {
    ctaLabel = "I've sent the e-transfer →";
  } else if (isConsentStep) {
    ctaLabel = "Continue to Payment →";
  } else {
    ctaLabel = "Continue →";
  }

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-14">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <TextLink href={`/programs/${program?.slug ?? cohort.programId}`}>
            ← Back to program
          </TextLink>
          <p className="text-sm text-white/70" aria-hidden="true">
            Step {step + 1} of {totalSteps}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          {/* Header */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
              ENROLLMENT — {cohort.label}
            </div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 text-2xl font-semibold focus:outline-none md:text-3xl"
            >
              <span className="sr-only">
                Step {step + 1} of {totalSteps}:{" "}
              </span>
              {STEP_TITLES[step]}
            </h1>
            <p className="mt-2 text-sm text-white/70">{STEP_SUBTITLES[step]}</p>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <ProgressBar step={step + 1} total={totalSteps} />
          </div>

          {/* Step content */}
          {step === 0 && (
            <OrderSummary
              cohort={cohort}
              program={program}
              seatsRemaining={seatsRemaining}
            />
          )}
          {step === 1 && (
            <WhoIsThisFor
              household={household}
              value={who}
              onChange={setWho}
              multiple
              intro="Every player takes their own seat. Add everyone now and pay once."
              errors={errors}
            />
          )}
          {step === 2 && (
            <RegistrantStep
              form={form}
              setForm={setForm}
              players={players}
              setPlayers={setPlayers}
              isMinor={isMinor}
              signedIn={household.signedIn}
              accountEmail={household.accountEmail}
              cohortId={cohort.id}
              onEnterSubmit={next}
              errors={errors}
            />
          )}
          {step === 3 && (
            <ConsentStep form={form} setForm={setForm} isMinor={isMinor} errors={errors} />
          )}
          {step === 4 && etransfer && (
            <EtransferStep
              cohort={cohort}
              info={etransfer}
              memo={memo}
              seats={seatCount}
              submitting={submitting}
              onPayByCard={() => void submit()}
            />
          )}

          {/* Navigation */}
          <div className="mt-6 flex flex-col gap-2">
            {pressedWithGaps && visibleIssues.length > 1 && (
              <div id="enroll-missing" className="text-sm text-red-400">
                <p className="font-semibold">To continue:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {visibleIssues.map((i) => (
                    <li key={i.id}>{i.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={back}
                  disabled={submitting}
                  className={`min-h-[44px] rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30 ${FOCUS_RING}`}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                aria-disabled={submitting || undefined}
                aria-describedby={
                  pressedWithGaps && visibleIssues.length > 1 ? "enroll-missing" : undefined
                }
                className={cn(
                  "ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] transition",
                  FOCUS_RING,
                  submitting ? "cursor-wait" : "hover:brightness-110"
                )}
              >
                {submitting && (
                  <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {ctaLabel}
              </button>
            </div>
            {isConsentStep && (
              <p className="text-right text-xs text-white/60">
                {COOLING_OFF_COPY}{" "}
                <Link
                  href="/legal/refund-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B4E655] underline-offset-2 hover:underline"
                >
                  Program Policies
                </Link>
              </p>
            )}
            {submitError && <FormAlert>{submitError}</FormAlert>}
            <LiveStatus
              message={
                submitting
                  ? etransfer && isLastStep
                    ? "Recording your e-transfer…"
                    : "Saving your enrollment…"
                  : ""
              }
            />
          </div>
        </div>
      </div>
    </main>
  );
}

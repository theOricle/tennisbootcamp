"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Cohort } from "@/types/cohort";
import type { Program } from "@/types/program";
import { formatDateRange, formatDaysTimes, formatCohortPrice } from "@/lib/cohorts";
import { VENUE_LINE } from "@/lib/membership";
import { trackEvent } from "@/lib/analytics";
import { TierRangeBadges } from "@/components/tiers";
import { amountDueCents, etransferMemo } from "@/lib/paymentTransitions";

// ─── Constants ────────────────────────────────────────────────────────────────

const WAIVER_VERSION = "v0-placeholder-2026-05-24";
// 0: summary  1: registrant  2: consent  (3: e-transfer instructions — only
// on cohorts whose payment_mode is 'etransfer'; card cohorts go straight to
// Stripe Checkout after consent, exactly as before.)
const CARD_STEPS = 3;
const ETRANSFER_STEPS = 4;

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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-[#B4E655] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm text-white/70">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
    />
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

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
      {/* Program */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
          {program?.type ?? "Program"}
        </p>
        <p className="mt-0.5 text-xl font-semibold text-white">
          {program?.title ?? cohort.programId}
        </p>
        {program?.ageGroup && (
          <p className="mt-0.5 text-sm text-white/50">{program.ageGroup}</p>
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
          <p className="text-xs text-white/40 uppercase tracking-wide font-semibold">Dates</p>
          <p className="mt-1 text-sm text-[#B4E655]">{formatDateRange(cohort)}</p>
          <p className="mt-0.5 text-xs text-white/50">{cohort.weeks} weeks</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-white/40 uppercase tracking-wide font-semibold">Sessions</p>
          <p className="mt-1 text-sm text-[#B4E655]">{formatDaysTimes(cohort)}</p>
          <p className="mt-0.5 text-xs text-white/50">
            {cohort.capacityMin}–{cohort.capacityMax} players
          </p>
        </div>
      </div>

      {/* Price + availability */}
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/60">Total</p>
          <p className="text-base font-semibold text-white">{price}</p>
        </div>
        {cohort.priceCents === 0 && (
          <p className="mt-1 text-xs text-white/40">
            Price will be confirmed before payment is collected.
          </p>
        )}
        {cohort.priceCents > 0 && (
          <p className="mt-1 text-xs text-white/40">
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
      <p className="text-xs text-white/50">
        7-day full-refund window — cancel up to 7 days before the start date.{" "}
        <Link
          href="/legal/refund-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#B4E655] underline-offset-2 hover:underline"
        >
          Refund Policy
        </Link>
      </p>
    </div>
  );
}

function RegistrantStep({
  form,
  setForm,
  isMinor,
  onEnterSubmit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  isMinor: boolean;
  onEnterSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onEnterSubmit();
      }}
      className="space-y-5"
    >
      {/* Participant */}
      <div>
        <p className="mb-3 text-sm font-semibold text-white">Participant</p>
        <div className="space-y-3">
          <FieldGroup label="Full name">
            <TextInput
              value={form.participantName}
              onChange={(v) => setForm((s) => ({ ...s, participantName: v }))}
              placeholder="Participant's full name"
              required
            />
          </FieldGroup>
          <FieldGroup label="Date of birth">
            <TextInput
              type="date"
              value={form.participantDob}
              onChange={(v) => setForm((s) => ({ ...s, participantDob: v }))}
              required
            />
          </FieldGroup>
          <FieldGroup label="Email">
            <TextInput
              type="email"
              value={form.contactEmail}
              onChange={(v) => setForm((s) => ({ ...s, contactEmail: v }))}
              placeholder="email@example.com"
              required
            />
          </FieldGroup>
          <FieldGroup label="Phone">
            <TextInput
              type="tel"
              value={form.contactPhone}
              onChange={(v) => setForm((s) => ({ ...s, contactPhone: v }))}
              placeholder="(647) 555-1234"
              required
            />
          </FieldGroup>
        </div>
      </div>

      {/* Guardian section — shown when participant is under 18 */}
      {isMinor && (
        <div className="rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-5 py-4">
          <p className="mb-1 text-sm font-semibold text-[#B4E655]">Parent / Guardian</p>
          <p className="mb-3 text-xs text-white/55">
            The guardian is the account holder and will sign the waiver.
          </p>
          <div className="space-y-3">
            <FieldGroup label="Full name">
              <TextInput
                value={form.guardianName}
                onChange={(v) => setForm((s) => ({ ...s, guardianName: v }))}
                placeholder="Guardian's full name"
                required
              />
            </FieldGroup>
            <FieldGroup label="Email">
              <TextInput
                type="email"
                value={form.guardianEmail}
                onChange={(v) => setForm((s) => ({ ...s, guardianEmail: v }))}
                placeholder="guardian@example.com"
                required
              />
            </FieldGroup>
            <FieldGroup label="Phone">
              <TextInput
                type="tel"
                value={form.guardianPhone}
                onChange={(v) => setForm((s) => ({ ...s, guardianPhone: v }))}
                placeholder="(647) 555-1234"
                required
              />
            </FieldGroup>
          </div>
        </div>
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
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  isMinor: boolean;
}) {
  const signerLabel = isMinor ? "guardian" : "participant";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-white/70 leading-relaxed">
          Before we can process payment, {isMinor ? "the guardian" : "you"} must read and
          agree to the Terms &amp; Liability Waiver and Refund Policy.
        </p>
      </div>

      {/* Checkbox */}
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
          form.consentChecked
            ? "border-[#B4E655]/40 bg-[#B4E655]/5"
            : "border-white/10 bg-white/5"
        )}
      >
        <input
          type="checkbox"
          checked={form.consentChecked}
          onChange={(e) => setForm((s) => ({ ...s, consentChecked: e.target.checked }))}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#B4E655]"
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
            Refund Policy
          </Link>
          {isMinor && (
            <span className="ml-1 text-white/50">
              (guardian agrees on behalf of the minor participant)
            </span>
          )}
        </span>
      </label>

      {/* Typed-name signature */}
      <FieldGroup label={`Type your full name to sign (${signerLabel})`}>
        <TextInput
          value={form.consentSignedName}
          onChange={(v) => setForm((s) => ({ ...s, consentSignedName: v }))}
          placeholder={`${isMinor ? "Guardian's" : "Your"} full name`}
        />
        <p className="text-xs text-white/40">
          By typing your name above you are providing an electronic signature.
        </p>
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
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      className="min-h-[44px] shrink-0 rounded-full border border-white/20 px-3 text-xs font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function EtransferStep({
  cohort,
  info,
  memo,
  submitting,
  onPayByCard,
}: {
  cohort: Cohort;
  info: EtransferInfo;
  memo: string;
  submitting: boolean;
  onPayByCard: () => void;
}) {
  const due = amountDueCents(cohort.priceCents, info.creditCents);
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-white/70">
        Send an Interac e-transfer with the details below. Your spot stays held
        until the coach confirms the transfer arrived. Once it does, you&apos;re
        in, and the confirmation email follows.
      </p>

      <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 text-sm">
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Amount</p>
          <p className="mt-1 text-xl font-semibold text-white">{moneyCAD(due)} CAD</p>
          {info.creditCents > 0 && (
            <p className="mt-0.5 text-xs text-white/50">
              {moneyCAD(cohort.priceCents)} − {moneyCAD(info.creditCents)} assessment credit
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Send to</p>
            <p className="mt-1 break-all font-medium text-[#B4E655]">{info.recipientEmail}</p>
          </div>
          <CopyButton value={info.recipientEmail} label="email address" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Message</p>
            <p className="mt-1 font-medium text-white">{memo}</p>
          </div>
          <CopyButton value={memo} label="message" />
        </div>
      </div>

      <p className="text-xs text-white/50">
        Put the message on the transfer exactly as shown — it&apos;s how we match
        your payment to your spot. We&apos;ve also emailed you these details.
      </p>

      <button
        type="button"
        onClick={onPayByCard}
        disabled={submitting}
        className="text-sm text-white/60 underline-offset-2 hover:text-white hover:underline disabled:opacity-40"
      >
        Prefer to pay by card? Pay by card instead
      </button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const STEP_TITLES = [
  "Review your enrollment",
  "Registrant details",
  "Terms & waiver",
  "Send your e-transfer",
];

const STEP_SUBTITLES = [
  "Confirm what you're signing up for before we collect your details.",
  "Tell us about the participant. If they're under 18, we'll also need a parent or guardian.",
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The Sheet row written by /api/enroll, kept so the e-transfer step can
  // offer card checkout (or re-send) without appending a second row.
  const [saved, setSaved] = useState<{
    rowNumber: number | null;
    consentAgreedAt: string;
  } | null>(null);

  useEffect(() => {
    trackEvent("enroll_start", {
      cohort_id: cohort.id,
      program: program?.title ?? cohort.programId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const age = computeAge(form.participantDob);
  const isMinor = age !== null && age < 18;
  const progress = Math.round(((step + 1) / totalSteps) * 100);

  function canContinue(): boolean {
    if (step === 0) return true;
    if (step === 1) {
      const base =
        form.participantName.trim().length > 0 &&
        form.participantDob.length > 0 &&
        age !== null &&
        form.contactEmail.trim().length > 0 &&
        form.contactPhone.trim().length > 0;
      const guardian =
        !isMinor ||
        (form.guardianName.trim().length > 0 &&
          form.guardianEmail.trim().length > 0 &&
          form.guardianPhone.trim().length > 0);
      return base && guardian;
    }
    if (step === 2) {
      return form.consentChecked && form.consentSignedName.trim().length > 0;
    }
    return true;
  }

  function enrollmentMeta(consentAgreedAt: string) {
    return {
      contactEmail: form.contactEmail,
      participantName: form.participantName,
      participantDob: form.participantDob,
      isMinor,
      contactPhone: form.contactPhone,
      guardianName: isMinor ? form.guardianName : undefined,
      guardianEmail: isMinor ? form.guardianEmail : undefined,
      guardianPhone: isMinor ? form.guardianPhone : undefined,
      consentSignedName: form.consentSignedName,
      consentAgreedAt,
      waiverVersion: WAIVER_VERSION,
      location: cohort.locationId,
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
        program: program?.title ?? cohort.programId,
        location: cohort.locationId,
        participantName: form.participantName,
        participantDob: form.participantDob,
        isMinor,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        guardianName: isMinor ? form.guardianName : "",
        guardianEmail: isMinor ? form.guardianEmail : "",
        guardianPhone: isMinor ? form.guardianPhone : "",
        consentSignedName: form.consentSignedName,
        consentAgreedAt,
        waiverVersion: WAIVER_VERSION,
      }),
    });
    if (!enrollRes.ok) throw new Error("enrollment");
    const enrollData = await enrollRes.json();
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
    if (!checkoutRes.ok) throw new Error("checkout");
    const { sessionUrl } = await checkoutRes.json();
    // Redirect to Stripe Checkout or confirmed page (mock)
    window.location.href = sessionUrl;
  }

  function reportError(err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "checkout") {
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

  function next() {
    if (!canContinue()) return;
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

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const isLastStep = step === totalSteps - 1;
  const isConsentStep = step === CARD_STEPS - 1;
  const memo = etransferMemo(form.participantName, cohort.label);

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
          <Link
            href={`/programs/${program?.slug ?? cohort.programId}`}
            className="text-sm text-white/60 hover:text-white"
          >
            ← Back to program
          </Link>
          <div className="text-sm text-white/60">
            Step {step + 1} of {totalSteps}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          {/* Header */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]/90">
              ENROLLMENT — {cohort.label}
            </div>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
              {STEP_TITLES[step]}
            </h1>
            <p className="mt-2 text-sm text-white/70">{STEP_SUBTITLES[step]}</p>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <ProgressBar value={progress} />
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
            <RegistrantStep
              form={form}
              setForm={setForm}
              isMinor={isMinor}
              onEnterSubmit={() => {
                if (canContinue() && !submitting) next();
              }}
            />
          )}
          {step === 2 && (
            <ConsentStep form={form} setForm={setForm} isMinor={isMinor} />
          )}
          {step === 3 && etransfer && (
            <EtransferStep
              cohort={cohort}
              info={etransfer}
              memo={memo}
              submitting={submitting}
              onPayByCard={() => void submit()}
            />
          )}

          {/* Navigation */}
          <div className="mt-6 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={back}
                  disabled={submitting}
                  className={cn(
                    "rounded-full px-5 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                    submitting
                      ? "bg-white/5 text-white/30"
                      : "bg-white/10 text-white hover:bg-white/15"
                  )}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={!canContinue() || submitting}
                className={cn(
                  "ml-auto inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                  !canContinue() && !submitting
                    ? "bg-[#B4E655]/30 text-[#061427]/50"
                    : submitting
                    ? "cursor-wait bg-[#B4E655] text-[#061427]"
                    : "bg-[#B4E655] text-[#061427] hover:brightness-110"
                )}
              >
                {submitting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {ctaLabel}
              </button>
            </div>
            {isConsentStep && (

              <p className="text-right text-xs text-white/50">
                7-day full-refund window — cancel up to 7 days before the start date.{" "}
                <Link
                  href="/legal/refund-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B4E655] underline-offset-2 hover:underline"
                >
                  Refund Policy
                </Link>
              </p>
            )}
            {submitError && (
              <p className="text-right text-sm text-red-400">{submitError}</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

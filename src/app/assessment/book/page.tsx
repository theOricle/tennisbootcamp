"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  trackAssessmentBookStart,
  trackAssessmentRequestSubmit,
} from "@/lib/analytics";
import {
  AvailabilityGrid,
  AvailabilityHoursLegend,
} from "@/components/ui/AvailabilityGrid";
import { parseAvailability, type Availability } from "@/lib/availability";
import {
  WhoIsThisFor,
  useHousehold,
  EMPTY_HOUSEHOLD,
  defaultAgeBand,
  householdIssues,
  type HouseholdValue,
} from "@/components/participants/WhoIsThisFor";
import { isAgeBand } from "@/lib/ageBand";
import { useBotCheck } from "@/lib/useBotCheck";
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
import { arrowStep, nextEnabledIndex, tabStopIndex } from "@/lib/rovingIndex";
import { Container } from "@/components/layout/Container";
import {
  FieldError,
  FormAlert,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  errorIdFor,
  fieldA11y,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";
import { TEXT_LINK_LIME, TextLink } from "@/components/ui/TextLink";

type PublicSlot = { slotStart: string; timeLabel: string; taken: boolean };
type PublicBlock = {
  blockId: string;
  date: string;
  dateLabel: string;
  locationLabel: string | null;
  slots: PublicSlot[];
};

type Prefill = {
  name?: string;
  email?: string;
  phone?: string;
  selfLevel?: string;
  availability?: unknown;
  /** Who the quiz was about, so the booking starts on the same person. */
  household?: HouseholdValue;
};

type Selected = { blockId: string; slotStart: string };

// Every submit failure offers the human fallback (voice.md, errors).
const SUBMIT_ERROR =
  "Something went wrong. Please try again, or email info@tennisbootcamp.ca and we'll set your time by hand.";
const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again, or email info@tennisbootcamp.ca.";

/** Field ids, so a press of the primary button can focus the first problem. */
const IDS = {
  slot: "booking-slot",
  availability: "booking-availability",
  name: "booking-name",
  email: "booking-email",
  phone: "booking-phone",
} as const;

function hasAnyAvailability(a: Availability): boolean {
  return Object.values(a.days).some((bands) => bands && bands.length > 0);
}

const SECTION_HEADING = "text-sm font-semibold uppercase tracking-wide text-[#B4E655]";

// ─── Slot picker (audit M22) ──────────────────────────────────────────────────

/**
 * One radio group per day: role="radio" with aria-checked, a tick as well as
 * colour, arrow keys that move and choose, one tab stop per day, and taken
 * times announced as booked (WCAG 1.3.1, 1.4.1, 4.1.2).
 */
function SlotPicker({
  blocks,
  selected,
  onSelect,
  error,
}: {
  blocks: PublicBlock[];
  selected: Selected | null;
  onSelect: (next: Selected) => void;
  error?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const key = (blockId: string, slotStart: string) => `${blockId}|${slotStart}`;
  // The first day that has an open time takes the field id, for focus.
  const firstOpenBlock = blocks.findIndex((b) => b.slots.some((s) => !s.taken));

  return (
    <div className="space-y-6">
      {blocks.map((b, bi) => {
        const disabled = b.slots.map((s) => s.taken);
        const checked = b.slots.findIndex(
          (s) => selected?.blockId === b.blockId && selected.slotStart === s.slotStart
        );
        const stop = tabStopIndex(disabled, checked);
        const dayId = `slot-day-${b.blockId}`;
        return (
          <div key={b.blockId}>
            <p id={dayId} className="text-sm font-semibold text-white">
              {b.dateLabel}
            </p>
            {b.locationLabel && (
              <p className="mt-0.5 text-xs text-white/60">{b.locationLabel}</p>
            )}
            <div
              role="radiogroup"
              aria-labelledby={dayId}
              aria-required="true"
              aria-describedby={error ? errorIdFor(IDS.slot) : undefined}
              className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4"
            >
              {b.slots.map((s, i) => {
                const isSel = i === checked;
                return (
                  <button
                    key={s.slotStart}
                    ref={(el) => {
                      if (el) refs.current.set(key(b.blockId, s.slotStart), el);
                      else refs.current.delete(key(b.blockId, s.slotStart));
                    }}
                    id={bi === firstOpenBlock && i === stop ? IDS.slot : undefined}
                    type="button"
                    role="radio"
                    aria-checked={isSel}
                    disabled={s.taken}
                    tabIndex={i === stop ? 0 : -1}
                    onClick={() => onSelect({ blockId: b.blockId, slotStart: s.slotStart })}
                    onKeyDown={(e) => {
                      const step = arrowStep(e.key);
                      if (step === null) return;
                      e.preventDefault();
                      const j = nextEnabledIndex(disabled, i, step);
                      if (j < 0) return;
                      const target = b.slots[j];
                      onSelect({ blockId: b.blockId, slotStart: target.slotStart });
                      refs.current.get(key(b.blockId, target.slotStart))?.focus();
                    }}
                    className={[
                      "inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                      FOCUS_RING,
                      isSel
                        ? "border-[#B4E655] bg-[#B4E655] text-[#061427]"
                        : "border-white/35 bg-white/5 text-white/85 hover:border-[#B4E655]/60 hover:text-white",
                      "disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/30 disabled:line-through",
                    ].join(" ")}
                  >
                    {isSel && <span aria-hidden="true">✓</span>}
                    {s.timeLabel}
                    {s.taken && <span className="sr-only">, booked</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Contact fields ───────────────────────────────────────────────────────────

// Account-holder contact fields, shared by the slot-booking and request-a-time
// forms. One holder, one inbox — the players they book for come from the
// "Who is this for?" chooser above. The player's own level is asked once, in
// their block, never again here (audit M21).
function ContactFields({
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  askName,
  signedIn,
  accountEmail,
  errors,
  onBlurField,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  /** False when the player is "Myself": their name is already above. */
  askName: boolean;
  signedIn: boolean;
  accountEmail: string;
  errors: Record<string, string>;
  onBlurField: (id: string, value: string) => void;
}) {
  const phoneField = (
    <div className="grid gap-1.5">
      <label htmlFor={IDS.phone} className={LABEL_CLASS}>
        Phone <span className="text-white/60">(optional)</span>
      </label>
      <input
        id={IDS.phone}
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onBlur={(e) => onBlurField(IDS.phone, e.target.value)}
        autoComplete="tel"
        inputMode="tel"
        placeholder="(647) 555-1234"
        className={INPUT_CLASS}
        {...fieldA11y(IDS.phone, { error: errors[IDS.phone] })}
      />
      <FieldError fieldId={IDS.phone} message={errors[IDS.phone]} />
    </div>
  );

  if (signedIn) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
          Booking on your account —{" "}
          <span className="font-semibold text-white">{accountEmail}</span>.
          Confirmations come here.
        </p>
        {phoneField}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {askName && (
        <div className="grid gap-1.5">
          <label htmlFor={IDS.name} className={LABEL_CLASS}>
            Your full name <span className="text-white/60">(the account holder)</span>
          </label>
          <input
            id={IDS.name}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => onBlurField(IDS.name, e.target.value)}
            autoComplete="name"
            className={INPUT_CLASS}
            required
            {...fieldA11y(IDS.name, { error: errors[IDS.name] })}
          />
          <FieldError fieldId={IDS.name} message={errors[IDS.name]} />
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={IDS.email} className={LABEL_CLASS}>
          Email
        </label>
        <input
          id={IDS.email}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={(e) => onBlurField(IDS.email, e.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          className={INPUT_CLASS}
          required
          {...fieldA11y(IDS.email, { error: errors[IDS.email] })}
        />
        <FieldError fieldId={IDS.email} message={errors[IDS.email]} />
      </div>
      {phoneField}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookAssessmentPage() {
  const [blocks, setBlocks] = useState<PublicBlock[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // The quiz's self-estimate, carried as the fallback for the booking row.
  const [prefillLevel, setPrefillLevel] = useState("");
  const [availability, setAvailability] = useState<Availability>({
    days: {},
    v: 1,
  });
  const [note, setNote] = useState("");

  // "slots" is the default; "request" is the coordinate-directly path — forced
  // when no open slots exist, optional behind a secondary link otherwise.
  const [requestMode, setRequestMode] = useState(false);
  const [requestDone, setRequestDone] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Field ids whose problems are on screen (pressed, or a filled field left).
  const [shown, setShown] = useState<Set<string>>(() => new Set());

  // Bot protection (backlog #25): honeypot + time since the page rendered.
  const bot = useBotCheck();

  // Who is this for? (backlog #11) — one booking is one participant, one slot.
  const household = useHousehold();
  const [who, setWho] = useState<HouseholdValue>(EMPTY_HOUSEHOLD);
  // Signed out with several players carried over from the quiz: the one this
  // slot is for (audit M21). Null means the first named player.
  const [slotForKey, setSlotForKey] = useState<string | null>(null);

  // Load open slots. All state updates happen in async callbacks so this is safe
  // to call from an effect as well as from event handlers.
  const loadSlots = useCallback(() => {
    fetch("/api/assessment/slots")
      .then((r) => r.json())
      .then((d) => {
        setBlocks(d.blocks ?? []);
        setLoadError(false);
      })
      .catch(() => {
        setBlocks([]);
        setLoadError(true);
      });
  }, []);

  useEffect(() => {
    loadSlots();
    // Prefill handoff from intake (Phase 2 populates this; harmless if absent).
    // Runs on the microtask queue so it doesn't setState synchronously during
    // the mount effect (which would cause a hydration-unsafe cascading render).
    Promise.resolve().then(() => {
      try {
        const raw = sessionStorage.getItem("assessmentPrefill");
        if (!raw) return;
        const p = JSON.parse(raw) as Prefill;
        if (p.name) setName(p.name);
        if (p.email) setEmail(p.email);
        if (p.phone) setPhone(p.phone);
        if (p.selfLevel) setPrefillLevel(p.selfLevel);
        if (p.availability) setAvailability(parseAvailability(p.availability));
        // A prefill written before backlog #14 has no age bands and no
        // profiles map; fill both in so the chooser renders. One booking is
        // one player, so a signed-in household starts on its first person.
        if (p.household?.guests?.length) {
          setWho({
            selectedIds: (p.household.selectedIds ?? []).slice(0, 1),
            profiles: p.household.profiles ?? {},
            guests: p.household.guests.map((g) => ({
              ...g,
              ageBand: isAgeBand(g.ageBand)
                ? g.ageBand
                : defaultAgeBand(g.relationship),
            })),
          });
        }
      } catch {
        // ignore malformed prefill
      }
    });
  }, [loadSlots]);

  const hasSlots = blocks?.some((b) => b.slots.length > 0) ?? false;
  const showRequestForm =
    blocks !== null && !loadError && (!hasSlots || requestMode);

  // Signed out: several named players means a "Who is this slot for?" choice;
  // the chooser below then shows only that player's block.
  const namedGuests = who.guests.filter((g) => g.name.trim());
  const choosingAmongGuests = !household.signedIn && namedGuests.length > 1;
  const slotGuest =
    (choosingAmongGuests
      ? namedGuests.find((g) => g.key === slotForKey) ?? namedGuests[0]
      : who.guests[0]) ?? null;
  const chooserValue: HouseholdValue = household.signedIn
    ? who
    : { ...who, guests: slotGuest ? [slotGuest] : who.guests };
  function onChooserChange(next: HouseholdValue) {
    if (household.signedIn || !slotGuest) {
      setWho(next);
      return;
    }
    const edited = next.guests[0];
    setWho({
      ...next,
      guests: who.guests.map((g) => (g.key === slotGuest.key && edited ? edited : g)),
    });
  }

  // "Myself": the player's name is the holder's name, asked once (audit M21).
  const selfBooking = !household.signedIn && slotGuest?.relationship === "self";
  const holderName = selfBooking ? slotGuest?.name.trim() ?? "" : name.trim();
  const playerName = household.signedIn
    ? household.participants.find((p) => p.id === who.selectedIds[0])?.name?.trim() ?? ""
    : slotGuest?.name.trim() ?? "";

  const availabilityPayload = hasAnyAvailability(availability)
    ? availability
    : undefined;

  /** The one person this booking is for, in the shape the API expects. */
  function whoPayload() {
    if (household.signedIn) {
      return { participantId: who.selectedIds[0] };
    }
    const guest = slotGuest && slotGuest.name.trim() ? slotGuest : undefined;
    return {
      participant: guest
        ? {
            name: guest.name.trim(),
            relationship: guest.relationship,
            isMinor: guest.isMinor,
            selfLevel: guest.selfLevel || undefined,
          }
        : undefined,
    };
  }

  /** The booking row's self-estimate: the player's own answer, else the quiz's. */
  const selfLevelPayload =
    (!household.signedIn && slotGuest?.selfLevel) || prefillLevel || undefined;

  /** Everything that stops this form, one issue per field, in screen order. */
  function formIssues(mode: "slots" | "request"): FieldIssue[] {
    const out: FieldIssue[] = [
      ...householdIssues(chooserValue, household.signedIn, household.participants),
    ];
    if (mode === "slots" && !selected) {
      out.push({ id: IDS.slot, message: FIELD_MESSAGES.slotMissing });
    }
    if (mode === "request" && !hasAnyAvailability(availability)) {
      out.push({ id: IDS.availability, message: "Tap at least one time that usually works." });
    }
    if (!household.signedIn) {
      if (!selfBooking) {
        const n = requiredError(name);
        if (n) out.push({ id: IDS.name, message: n });
      }
      const e = emailError(email);
      if (e) out.push({ id: IDS.email, message: e });
    }
    const ph = phoneError(phone, { required: false });
    if (ph) out.push({ id: IDS.phone, message: ph });
    return out;
  }

  const mode = showRequestForm ? "request" : "slots";
  const issues = formIssues(mode);
  const errors = issuesById(issues.filter((i) => shown.has(i.id)));

  function onBlurField(id: string, value: string) {
    if (!value.trim()) return;
    setShown((s) => (s.has(id) ? s : new Set(s).add(id)));
  }

  /** Show every problem and focus the first; false when the form is fine. */
  function blockOnIssues(): boolean {
    const found = formIssues(mode);
    if (found.length === 0) return false;
    setShown((s) => {
      const out = new Set(s);
      for (const i of found) out.add(i.id);
      return out;
    });
    const id = firstIssueId(found);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (blockOnIssues() || !selected) return;
    setSubmitting(true);
    setError(null);
    trackAssessmentBookStart();

    try {
      const res = await fetch("/api/assessment/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: selected.blockId,
          slotStart: selected.slotStart,
          name: holderName,
          email: email.trim(),
          phone: phone.trim() || undefined,
          selfLevel: selfLevelPayload,
          availability: availabilityPayload,
          ...whoPayload(),
          ...bot.payload(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(withHumanFallback(data.error ?? SUBMIT_ERROR));
        setSubmitting(false);
        // A taken slot means our view is stale — refresh the grid.
        if (res.status === 409) {
          setSelected(null);
          loadSlots();
        }
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(SUBMIT_ERROR);
      setSubmitting(false);
    } catch {
      setError(NETWORK_ERROR);
      setSubmitting(false);
    }
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (blockOnIssues()) return;
    setSubmitting(true);
    setError(null);
    trackAssessmentRequestSubmit(hasSlots ? "prefer-direct" : "no-slots");

    try {
      const res = await fetch("/api/assessment/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "request",
          name: holderName,
          email: email.trim(),
          phone: phone.trim() || undefined,
          selfLevel: selfLevelPayload,
          availability,
          note: note.trim() || undefined,
          ...whoPayload(),
          ...bot.payload(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(withHumanFallback(data.error ?? SUBMIT_ERROR));
        setSubmitting(false);
        return;
      }
      setRequestDone(true);
    } catch {
      setError(NETWORK_ERROR);
      setSubmitting(false);
    }
  }

  const selectedBlock = blocks?.find((b) => b.blockId === selected?.blockId);
  const selectedSlot = selectedBlock?.slots.find((s) => s.slotStart === selected?.slotStart);
  const selectedLabel =
    selectedBlock && selectedSlot ? `${selectedBlock.dateLabel} · ${selectedSlot.timeLabel}` : "";

  const whoSection = (
    <section aria-labelledby="book-who">
      <h2 id="book-who" className={SECTION_HEADING}>
        1 · Who is this for?
      </h2>
      <div className="mt-4 space-y-4">
        {choosingAmongGuests && (
          <fieldset>
            <legend className={LABEL_CLASS}>Who is this slot for?</legend>
            <p className="mt-1 text-xs text-white/60">
              One assessment, one player. Book the next player after this one.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {namedGuests.map((g) => {
                const on = g.key === slotGuest?.key;
                return (
                  <label
                    key={g.key}
                    className={[
                      "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      on
                        ? "border-[#B4E655]/60 bg-[#B4E655]/10 text-white"
                        : "border-white/15 bg-white/5 text-white/85 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="slot-for"
                      checked={on}
                      onChange={() => setSlotForKey(g.key)}
                      className={`h-4 w-4 shrink-0 accent-[#B4E655] ${FOCUS_RING}`}
                    />
                    {g.name.trim()}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <WhoIsThisFor
          household={household}
          value={chooserValue}
          onChange={onChooserChange}
          errors={errors}
          intro={
            choosingAmongGuests
              ? undefined
              : household.signedIn
                ? "One assessment, one player. Booking for two of your people? Book the first, then come back for the next."
                : "One assessment, one player. Your own details come next — they stay the account everything is booked under."
          }
        />
      </div>
    </section>
  );

  const contactSection = (
    <section aria-labelledby="book-details">
      <h2 id="book-details" className={SECTION_HEADING}>
        3 · Your details
      </h2>
      <div className="mt-4">
        <ContactFields
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          askName={!selfBooking}
          signedIn={household.signedIn}
          accountEmail={household.accountEmail}
          errors={errors}
          onBlurField={onBlurField}
        />
        {showRequestForm && (
          <div className="mt-4 grid gap-1.5">
            <label htmlFor="note" className={LABEL_CLASS}>
              Anything we should know? <span className="text-white/60">(optional)</span>
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Injuries, preferred courts, a tight week…"
              className={INPUT_CLASS}
            />
          </div>
        )}
      </div>
    </section>
  );

  const primaryClass = `min-h-[48px] w-full rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 ${FOCUS_RING}`;

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <Container className="py-10 sm:py-16">
        {/* Two columns from lg (audit M21): the form, and a summary that
            follows the choices. One column on phones. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-8">
              <TextLink href="/assessment">← The assessment</TextLink>
              <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                Book your 20-minute assessment
              </h1>
              <p className="mt-2 text-sm text-white/70">
                The assessment is $20 — enroll in a program afterward and that $20
                comes off the price. Pick a time that works, then a couple of
                details.
              </p>
              <p className="mt-3 text-sm text-white/70">
                Not sure where you stand?{" "}
                <Link
                  href="/intake"
                  className="font-semibold text-[#B4E655] underline-offset-2 hover:underline"
                >
                  Take the 2-minute quiz first
                </Link>
                .
              </p>
            </div>

            {requestDone ? (
              <div role="status" className="rounded-2xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-6">
                <h2 className="text-lg font-semibold text-white">
                  Request received.
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  We&apos;ll reach out within a day to set your time around the
                  availability you gave us. Watch your inbox.
                </p>
                <p className="mt-3 text-sm text-white/70">
                  No payment now — we&apos;ll confirm your time first. The
                  assessment is $20, and if you enroll in a program afterward that
                  $20 comes off the price.
                </p>
                <Link href="/" className={`mt-5 ${TEXT_LINK_LIME}`}>
                  Back to the homepage →
                </Link>
              </div>
            ) : blocks === null ? (
              <p role="status" className="text-sm text-white/60">
                Loading open times…
              </p>
            ) : loadError ? (
              <div role="alert" className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                <p>
                  We couldn&apos;t load times right now. Try again, or email
                  info@tennisbootcamp.ca and we&apos;ll set your time by hand.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4">
                  <button type="button" onClick={loadSlots} className={TEXT_LINK_LIME}>
                    Try again
                  </button>
                  <Link href="/programs" className={TEXT_LINK_LIME}>
                    Browse Programs
                  </Link>
                </div>
              </div>
            ) : showRequestForm ? (
              <form noValidate onSubmit={handleRequestSubmit} className="space-y-8">
                {bot.field}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/75">
                  {hasSlots ? (
                    <>
                      <p>
                        Tell us when you play and we&apos;ll coordinate your time
                        directly.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setRequestMode(false);
                          setError(null);
                        }}
                        className={`mt-1 ${TEXT_LINK_LIME}`}
                      >
                        ← Back to open times
                      </button>
                    </>
                  ) : (
                    <p>
                      No open times are posted right now. Tell us when you play and
                      we&apos;ll coordinate your time directly.
                    </p>
                  )}
                </div>

                {whoSection}

                <section aria-labelledby="book-when">
                  <h2 id="book-when" className={SECTION_HEADING}>
                    2 · When can they play?
                  </h2>
                  <p className="mt-2 text-sm text-white/70">
                    Tap every time of week that usually works for you.
                  </p>
                  <AvailabilityHoursLegend className="mt-2" />
                  <div className="mt-4">
                    <AvailabilityGrid
                      value={availability}
                      onChange={setAvailability}
                      label="Times that usually work"
                      firstCellId={IDS.availability}
                      describedBy={errors[IDS.availability] ? errorIdFor(IDS.availability) : undefined}
                    />
                  </div>
                  <div className="mt-2">
                    <FieldError fieldId={IDS.availability} message={errors[IDS.availability]} />
                  </div>
                </section>

                {contactSection}

                {error && <FormAlert>{error}</FormAlert>}
                <LiveStatus message={submitting ? "Sending your request…" : ""} />

                <button
                  type="submit"
                  aria-disabled={submitting || undefined}
                  className={`${primaryClass} ${submitting ? "cursor-wait" : ""}`}
                >
                  {submitting ? "Sending…" : "Request a time"}
                </button>
                <p className="text-center text-xs text-white/60">
                  No payment now — we&apos;ll confirm your time first. The
                  assessment is $20, and if you enroll in a program afterward that
                  $20 comes off the price.
                </p>
              </form>
            ) : (
              <form noValidate onSubmit={handleSubmit} className="space-y-8">
                {bot.field}
                {whoSection}

                <section aria-labelledby="book-slot">
                  <h2 id="book-slot" className={SECTION_HEADING}>
                    2 · Pick a slot
                  </h2>
                  <div className="mt-4">
                    <SlotPicker
                      blocks={blocks.filter((b) => b.slots.length > 0)}
                      selected={selected}
                      onSelect={setSelected}
                      error={errors[IDS.slot]}
                    />
                  </div>
                  <div className="mt-3">
                    <FieldError fieldId={IDS.slot} message={errors[IDS.slot]} />
                  </div>
                  <p className="mt-3 text-sm text-white/70">
                    Prefer to coordinate directly?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setRequestMode(true);
                        setError(null);
                      }}
                      className={TEXT_LINK_LIME}
                    >
                      Request a time instead
                    </button>
                  </p>
                </section>

                {contactSection}

                {error && <FormAlert>{error}</FormAlert>}
                <LiveStatus message={submitting ? "Booking your slot…" : ""} />

                <button
                  type="submit"
                  aria-disabled={submitting || undefined}
                  className={`${primaryClass} ${submitting ? "cursor-wait" : ""}`}
                >
                  {submitting ? "Booking…" : "Continue to payment"}
                </button>
                <p className="text-center text-xs text-white/60">
                  You&apos;ll confirm your $20 payment on the next step. Cancel anytime
                  before you pay.
                </p>
              </form>
            )}
            <p className="mt-6 text-center text-xs text-white/60 lg:hidden">
              Refunds, weather rebooking and the $20 credit are set out in our{" "}
              <Link
                href="/legal/refund-policy"
                className="text-[#B4E655] underline-offset-2 hover:underline"
              >
                Program Policies
              </Link>
              .
            </p>
          </div>

          {/* Desktop summary: what you're booking, as you choose it. */}
          <aside aria-label="Your assessment" className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]">
                Your assessment
              </p>
              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">On court</dt>
                  <dd className="mt-1 text-sm text-white/90">20 minutes with the coach</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Price</dt>
                  <dd className="mt-1 text-sm text-white/90">
                    $20 — enroll in a program afterward and that $20 comes off the price.
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Player</dt>
                  <dd className="mt-1 text-sm text-white/90">{playerName || "Not chosen yet"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Time</dt>
                  <dd className="mt-1 text-sm tabular-nums text-white/90">
                    {showRequestForm
                      ? "We'll set it with you"
                      : selectedLabel || "Pick a slot"}
                  </dd>
                </div>
              </dl>
              <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/60">
                Refunds, weather rebooking and the $20 credit are set out in our{" "}
                <Link
                  href="/legal/refund-policy"
                  className="text-[#B4E655] underline-offset-2 hover:underline"
                >
                  Program Policies
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </main>
  );
}

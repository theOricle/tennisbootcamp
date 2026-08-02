"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  trackAssessmentBookStart,
  trackAssessmentRequestSubmit,
} from "@/lib/analytics";
import { AvailabilityGrid } from "@/components/ui/AvailabilityGrid";
import { parseAvailability, type Availability } from "@/lib/availability";

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
};

const SELF_LEVELS = [
  { value: "", label: "Prefer not to say" },
  { value: "new", label: "Just starting out" },
  { value: "rally", label: "I can rally" },
  { value: "competitive", label: "I play competitively" },
  { value: "unsure", label: "Not sure" },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasAnyAvailability(a: Availability): boolean {
  return Object.values(a.days).some((bands) => bands && bands.length > 0);
}

const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder-white/35 " +
  "focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

// Contact fields shared by the slot-booking and request-a-time forms.
function ContactFields({
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  selfLevel,
  setSelfLevel,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  selfLevel: string;
  setSelfLevel: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm text-white/70">
          Full name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={inputClass}
          required
        />
      </div>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-white/70">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          className={inputClass}
          required
        />
      </div>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm text-white/70">
          Phone <span className="text-white/35">(optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="selfLevel" className="mb-1.5 block text-sm text-white/70">
          Where&apos;s your game right now?{" "}
          <span className="text-white/35">(optional)</span>
        </label>
        <select
          id="selfLevel"
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
        <p className="mt-1.5 text-xs text-white/40">
          Just a starting point — your real level comes from the court.
        </p>
      </div>
    </div>
  );
}

export default function BookAssessmentPage() {
  const [blocks, setBlocks] = useState<PublicBlock[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<{
    blockId: string;
    slotStart: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selfLevel, setSelfLevel] = useState("");
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
        if (p.selfLevel) setSelfLevel(p.selfLevel);
        if (p.availability) setAvailability(parseAvailability(p.availability));
      } catch {
        // ignore malformed prefill
      }
    });
  }, [loadSlots]);

  const hasSlots = blocks?.some((b) => b.slots.length > 0) ?? false;
  const showRequestForm =
    blocks !== null && !loadError && (!hasSlots || requestMode);

  const availabilityPayload = hasAnyAvailability(availability)
    ? availability
    : undefined;

  const canSubmit =
    !!selected && name.trim().length > 0 && isValidEmail(email.trim()) && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selected) return;
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
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          selfLevel: selfLevel || undefined,
          availability: availabilityPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        // A taken slot means our view is stale — refresh the grid.
        if (res.status === 409) {
          setSelected(null);
          loadSlots();
        }
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const canSubmitRequest =
    name.trim().length > 0 &&
    isValidEmail(email.trim()) &&
    hasAnyAvailability(availability) &&
    !submitting;

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitRequest) return;
    setSubmitting(true);
    setError(null);
    trackAssessmentRequestSubmit(hasSlots ? "prefer-direct" : "no-slots");

    try {
      const res = await fetch("/api/assessment/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "request",
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          selfLevel: selfLevel || undefined,
          availability,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setRequestDone(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-lg px-6 py-12 sm:py-16">
        <div className="mb-8">
          <Link
            href="/assessment"
            className="text-sm text-white/50 transition-colors hover:text-white/80"
          >
            ← The assessment
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-white sm:text-3xl">
            Book your 20-minute assessment
          </h1>
          <p className="mt-2 text-sm text-white/60">
            The assessment is $20 — enroll in a program afterward and that $20
            comes off the price. Pick a time that works, then a couple of
            details.
          </p>
          <p className="mt-3 text-sm text-white/45">
            Not sure where you stand?{" "}
            <Link
              href="/intake"
              className="font-semibold text-[#B4E655]/80 underline-offset-2 transition-colors hover:text-[#B4E655] hover:underline"
            >
              Take the 2-minute quiz first
            </Link>
            .
          </p>
        </div>

        {requestDone ? (
          <div className="rounded-2xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-6">
            <h2 className="text-lg font-semibold text-white">
              Request received.
            </h2>
            <p className="mt-2 text-sm text-white/70">
              We&apos;ll reach out within a day to set your time around the
              availability you gave us. Watch your inbox.
            </p>
            <p className="mt-3 text-sm text-white/60">
              No payment now — we&apos;ll confirm your time first. The
              assessment is $20, and if you enroll in a program afterward that
              $20 comes off the price.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex min-h-[44px] items-center text-sm font-semibold text-[#B4E655] underline-offset-2 hover:underline"
            >
              Back to the homepage →
            </Link>
          </div>
        ) : blocks === null ? (
          <p className="text-sm text-white/50">Loading open times…</p>
        ) : loadError ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
            We couldn&apos;t load times right now.{" "}
            <button
              type="button"
              onClick={loadSlots}
              className="font-semibold text-[#B4E655] underline-offset-2 hover:underline"
            >
              Try again
            </button>
            {" or "}
            <Link
              href="/programs"
              className="font-semibold text-[#B4E655] underline-offset-2 hover:underline"
            >
              browse programs
            </Link>
            .
          </div>
        ) : showRequestForm ? (
          <form onSubmit={handleRequestSubmit} className="space-y-8">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
              {hasSlots ? (
                <>
                  <p>
                    Tell us when you play and we&apos;ll coordinate your time
                    directly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRequestMode(false)}
                    className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[#B4E655] underline-offset-2 hover:underline"
                  >
                    ← Back to open times
                  </button>
                </>
              ) : (
                <p>
                  No open times are posted right now — but that doesn&apos;t
                  stop you. Tell us when you play and we&apos;ll coordinate your
                  time directly.
                </p>
              )}
            </div>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#B4E655]">
                1 · When can you play?
              </h2>
              <p className="mt-2 text-sm text-white/55">
                Tap every time of week that usually works for you.
              </p>
              <div className="mt-4">
                <AvailabilityGrid value={availability} onChange={setAvailability} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#B4E655]">
                2 · Your details
              </h2>
              <div className="mt-4">
                <ContactFields
                  name={name}
                  setName={setName}
                  email={email}
                  setEmail={setEmail}
                  phone={phone}
                  setPhone={setPhone}
                  selfLevel={selfLevel}
                  setSelfLevel={setSelfLevel}
                />
                <div className="mt-4">
                  <label htmlFor="note" className="mb-1.5 block text-sm text-white/70">
                    Anything we should know?{" "}
                    <span className="text-white/35">(optional)</span>
                  </label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Injuries, preferred courts, a tight week…"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            {error && (
              <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmitRequest}
              className="min-h-[48px] w-full rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              {submitting ? "Sending…" : "Request a time"}
            </button>
            <p className="text-center text-xs text-white/40">
              No payment now — we&apos;ll confirm your time first. The
              assessment is $20, and if you enroll in a program afterward that
              $20 comes off the price.
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Slot picker */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#B4E655]">
                1 · Pick a slot
              </h2>

              <div className="mt-4 space-y-6">
                {blocks
                  .filter((b) => b.slots.length > 0)
                  .map((b) => (
                    <div key={b.blockId}>
                      <p className="text-sm font-semibold text-white">
                        {b.dateLabel}
                      </p>
                      {b.locationLabel && (
                        <p className="mt-0.5 text-xs text-white/45">
                          {b.locationLabel}
                        </p>
                      )}
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {b.slots.map((s) => {
                          const isSel =
                            selected?.blockId === b.blockId &&
                            selected?.slotStart === s.slotStart;
                          return (
                            <button
                              key={s.slotStart}
                              type="button"
                              disabled={s.taken}
                              onClick={() =>
                                setSelected({
                                  blockId: b.blockId,
                                  slotStart: s.slotStart,
                                })
                              }
                              className={[
                                "min-h-[44px] rounded-xl border px-2 py-2 text-sm font-medium transition",
                                s.taken
                                  ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/25 line-through"
                                  : isSel
                                    ? "border-[#B4E655] bg-[#B4E655] text-[#061427]"
                                    : "border-white/15 bg-white/5 text-white/80 hover:border-[#B4E655]/50",
                              ].join(" ")}
                            >
                              {s.timeLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>

              <p className="mt-4 text-sm text-white/45">
                Prefer to coordinate directly?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setRequestMode(true);
                    setError(null);
                  }}
                  className="font-semibold text-[#B4E655]/80 underline-offset-2 transition-colors hover:text-[#B4E655] hover:underline"
                >
                  Request a time instead
                </button>
                .
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#B4E655]">
                2 · Your details
              </h2>
              <div className="mt-4">
                <ContactFields
                  name={name}
                  setName={setName}
                  email={email}
                  setEmail={setEmail}
                  phone={phone}
                  setPhone={setPhone}
                  selfLevel={selfLevel}
                  setSelfLevel={setSelfLevel}
                />
              </div>
            </section>

            {error && (
              <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-[48px] w-full rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              {submitting ? "Booking…" : "Continue to payment"}
            </button>
            <p className="text-center text-xs text-white/40">
              You&apos;ll confirm your $20 payment on the next step. Cancel anytime
              before you pay.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

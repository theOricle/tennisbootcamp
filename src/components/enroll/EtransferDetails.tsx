"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { LiveStatus } from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";
import {
  parseEtransferDetails,
  readEtransferRaw,
  tabStorage,
  type EtransferDetails,
} from "@/lib/etransferHandoff";

// The amount, the address and the message of an e-transfer, as one box: on
// the sign-up page's last step, and again on the page after it (backlog
// #101), so both read the same.

/** Under the box, on the step and on the page after it. */
export const ETRANSFER_MEMO_NOTE =
  "Put the message on the transfer exactly as shown — it's how we match your payment to your spot. We've also emailed you these details.";

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

/** The three rows: Amount, Send to, Message. */
export function EtransferDetailsBox({ details }: { details: EtransferDetails }) {
  return (
    <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 text-sm">
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Amount</p>
        <p className="mt-1 text-xl font-semibold text-white">{details.amount}</p>
        {details.breakdown && <p className="mt-0.5 text-xs text-white/70">{details.breakdown}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Send to</p>
          <p className="mt-1 break-all font-medium text-[#B4E655]">{details.recipientEmail}</p>
        </div>
        <CopyButton value={details.recipientEmail} label="email address" />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Message</p>
          <p className="mt-1 font-medium text-white">{details.memo}</p>
        </div>
        <CopyButton value={details.memo} label="message" />
      </div>
    </div>
  );
}

const noSubscription = () => () => undefined;

/**
 * The page after "I've sent the e-transfer": the details the step left in
 * this tab (src/lib/etransferHandoff.ts), drawn as the step drew them. With
 * none there (another device, a later visit) it renders nothing, and the
 * page's own "in your inbox" line stands. Read after hydration, so the
 * server's markup and the first paint agree.
 */
export function EtransferDetailsFromStep({ cohortId, className = "" }: { cohortId: string; className?: string }) {
  const raw = useSyncExternalStore(
    noSubscription,
    () => readEtransferRaw(tabStorage(), cohortId),
    () => null
  );
  const details = useMemo(() => parseEtransferDetails(raw), [raw]);
  if (!details) return null;
  return <EtransferDetailsSection details={details} className={className} />;
}

/** The heading, the box and the note, as the page after the step shows them. */
export function EtransferDetailsSection({ details, className = "" }: { details: EtransferDetails; className?: string }) {
  return (
    <section aria-labelledby="etransfer-details-heading" className={className}>
      <h2 id="etransfer-details-heading" className="mb-3 text-sm font-semibold text-white">
        Your e-transfer details
      </h2>
      <EtransferDetailsBox details={details} />
      <p className="mt-3 text-xs text-white/70">{ETRANSFER_MEMO_NOTE}</p>
    </section>
  );
}

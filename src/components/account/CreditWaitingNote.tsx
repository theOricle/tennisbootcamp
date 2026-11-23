"use client";

import { useState } from "react";
import {
  CREDIT_WAITING_LEAD,
  CREDIT_WAITING_STEP,
  SIGN_IN_LINK_BUTTON,
  SIGN_IN_LINK_FAILED,
  SIGN_IN_LINK_SENT,
  type CreditWaitingPage,
} from "@/lib/signInLink";

// A signed-in account with a paid $20 assessment that was booked under its
// address while nobody was signed in (backlog #84, safety review). The $20 is
// not on the account until its owner signs in through an emailed link, so the
// page says so in one line and sends that link. Nothing here promises the
// credit before the link is opened.

const buttonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] disabled:cursor-not-allowed disabled:opacity-60";

export function CreditWaitingNote({
  page,
  next,
  className = "",
}: {
  /** Which page shows it: the words name that page's price. */
  page: CreditWaitingPage;
  /** Where the emailed link lands: this page, so the player carries on. */
  next: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/auth/sign-in-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next }),
      });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className={className}>
      <p className="text-sm leading-relaxed text-white/75">
        {CREDIT_WAITING_LEAD} {CREDIT_WAITING_STEP[page]}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={send}
          disabled={state === "sending" || state === "sent"}
          className={buttonClass}
        >
          {SIGN_IN_LINK_BUTTON}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-white/75">
          {state === "sent" ? SIGN_IN_LINK_SENT : state === "failed" ? SIGN_IN_LINK_FAILED : ""}
        </p>
      </div>
    </div>
  );
}

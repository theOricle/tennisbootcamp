"use client";

import { useEffect } from "react";
import {
  trackEvent,
  trackCohortInvitePaid,
  trackCohortConfirmed,
} from "@/lib/analytics";

export function EnrollCompleteEvent({
  cohortId,
  program,
  viaInvite = false,
  cohortConfirmed = false,
  paymentMethod = "card",
}: {
  cohortId: string;
  program: string;
  viaInvite?: boolean;
  cohortConfirmed?: boolean;
  paymentMethod?: "card" | "etransfer";
}) {
  useEffect(() => {
    trackEvent("enroll_complete", {
      cohort_id: cohortId,
      program,
      payment_method: paymentMethod,
    });
    // An e-transfer landing here is only a promise to pay — the invite flips
    // to paid when the coach confirms receipt, so no paid/confirmed events yet.
    if (viaInvite && paymentMethod === "card") {
      trackCohortInvitePaid(cohortId);
      if (cohortConfirmed) trackCohortConfirmed(cohortId);
    }
  }, [cohortId, program, viaInvite, cohortConfirmed, paymentMethod]);
  return null;
}


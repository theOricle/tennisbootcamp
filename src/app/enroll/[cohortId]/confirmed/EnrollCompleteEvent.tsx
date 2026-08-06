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
}: {
  cohortId: string;
  program: string;
  viaInvite?: boolean;
  cohortConfirmed?: boolean;
}) {
  useEffect(() => {
    trackEvent("enroll_complete", { cohort_id: cohortId, program });
    if (viaInvite) {
      trackCohortInvitePaid(cohortId);
      if (cohortConfirmed) trackCohortConfirmed(cohortId);
    }
  }, [cohortId, program, viaInvite, cohortConfirmed]);
  return null;
}

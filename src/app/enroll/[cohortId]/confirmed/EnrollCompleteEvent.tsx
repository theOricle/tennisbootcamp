"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function EnrollCompleteEvent({
  cohortId,
  program,
}: {
  cohortId: string;
  program: string;
}) {
  useEffect(() => {
    trackEvent("enroll_complete", { cohort_id: cohortId, program });
  }, [cohortId, program]);
  return null;
}

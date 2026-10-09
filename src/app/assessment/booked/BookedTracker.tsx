"use client";

import { useEffect } from "react";
import { firstSightOfBooking, trackAssessmentBookComplete } from "@/lib/analytics";

/** Counts a booking once per booking id, never on a reload (audit L13). */
export function BookedTracker({ bookingId }: { bookingId: string | null }) {
  useEffect(() => {
    let store: Storage | null = null;
    try {
      store = window.localStorage;
    } catch {
      store = null;
    }
    if (firstSightOfBooking(bookingId, store)) trackAssessmentBookComplete();
  }, [bookingId]);
  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { setGaPageLocation } from "@/lib/analytics";

/**
 * Re-trims GA's page_location and page_referrer on every client-side
 * navigation. The first load is handled by GA_STRIP_QUERY_SCRIPT.
 */
export function AnalyticsPageLocation() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const current = window.location.href;
    if (previous.current !== null) setGaPageLocation(current, previous.current);
    previous.current = current;
  }, [pathname]);

  return null;
}

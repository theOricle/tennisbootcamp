"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { setGaPageLocation } from "@/lib/analytics";

/**
 * Sends a trimmed page_view on every client-side navigation. The first load
 * is skipped: GA_STRIP_QUERY_SCRIPT trims it and the config sends it.
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

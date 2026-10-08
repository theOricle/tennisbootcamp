"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { setGaPageLocation } from "@/lib/analytics";

/**
 * Sends a trimmed page_view on every client-side navigation, including one
 * that changes only the query string. The first load is skipped:
 * gaInitScript trims it and the config sends it.
 */
function PageViewOnNavigation() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const previous = useRef<string | null>(null);

  // Dev StrictMode runs this effect twice on mount, so dev sends one extra page_view; production is unaffected.
  useEffect(() => {
    const current = window.location.href;
    if (previous.current !== null) setGaPageLocation(current, previous.current);
    previous.current = current;
  }, [pathname, search]);

  return null;
}

/** useSearchParams needs a Suspense boundary so static pages still prerender. */
export function AnalyticsPageLocation() {
  return (
    <Suspense fallback={null}>
      <PageViewOnNavigation />
    </Suspense>
  );
}

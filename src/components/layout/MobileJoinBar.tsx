"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  JOIN_CTA_HREF,
  JOIN_CTA_LABEL,
  MAIN_CTA_ATTR,
  joinBarAllowedOn,
  joinBarVisible,
} from "@/lib/mainAction";
import { useAuthState } from "@/lib/useAuthState";

/**
 * Phones only (audit M13): a sticky bottom bar with the one main button,
 * "Join a group", to the groups (owner, 2026-11-16). It slides in once the
 * page's own main button (the hero's, on home) has scrolled out, slides away
 * while any in-page main button is on screen, and never shows on the
 * programs pages (where every group has its own button), the quiz, sign-in,
 * booking or signed-in routes, or to a signed-in visitor. Rules:
 * src/lib/mainAction.ts.
 */
export function MobileJoinBar() {
  const pathname = usePathname() ?? "/";
  const allowed = joinBarAllowedOn(pathname);
  const { signedIn } = useAuthState();
  const [scrollY, setScrollY] = useState(0);
  // Keyed by the path it was measured on: a page with no main button has
  // nothing to observe, so the observer never calls back there, and the last
  // page's reading must not carry over (audit M13). Same idea as the
  // Navbar's lastPath, without a setState inside the effect.
  const [ctaState, setCtaState] = useState({ path: pathname, inView: false });
  const ctaInView = ctaState.path === pathname && ctaState.inView;

  useEffect(() => {
    if (!allowed) return;

    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Re-queried per route: the page's main buttons are server-rendered, so
    // they are in the DOM when this effect runs.
    const inView = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      setCtaState({ path: pathname, inView: inView.size > 0 });
    });
    document.querySelectorAll(`[${MAIN_CTA_ATTR}]`).forEach((el) => io.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [allowed, pathname]);

  if (!allowed || signedIn) return null;

  const show = joinBarVisible({ allowed, signedIn, scrollY, ctaInView });

  return (
    <>
      {/* Room under the footer so the bar never covers its last row. */}
      <div aria-hidden="true" className="h-[calc(5rem+env(safe-area-inset-bottom))] md:hidden" />
      <div
        inert={!show}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#061427] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden motion-safe:transition-transform motion-safe:duration-300 ${
          show ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <Button variant="primary" href={JOIN_CTA_HREF} className="w-full">
          {JOIN_CTA_LABEL}
        </Button>
      </div>
    </>
  );
}

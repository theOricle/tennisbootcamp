"use client";

import type { MouseEvent, ReactNode } from "react";

/**
 * A group card's "Notify me" (backlog #85): a link to the newsletter form,
 * the footer's line (`#notify`) or a page's own form (`#cohorts` on a
 * program page with no open block). With scripts on, it puts the focus
 * straight into that form's email field, so a keyboard or screen-reader user
 * lands where they type. Without scripts, or when the field is not there
 * (the form already sent shows its thank-you line instead), it is the plain
 * jump to the form.
 */
export function NotifyLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!href.startsWith("#")) return;
    const form = document.getElementById(href.slice(1));
    const field = form?.querySelector<HTMLInputElement>('input[type="email"]');
    // A hidden form (display: none) has no boxes: leave the plain jump.
    if (!form || !field || field.getClientRects().length === 0) return;
    event.preventDefault();
    form.scrollIntoView({ block: "start" });
    field.focus({ preventScroll: true });
    window.history.replaceState(null, "", href);
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

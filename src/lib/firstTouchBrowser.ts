// Browser half of the first-touch capture (backlog #26, rules in
// src/lib/leadSource.ts). Everything here touches window or localStorage,
// is wrapped so a blocked or missing storage never throws, and no-ops on the
// server.

import { SITE_URL } from "@/lib/siteUrl";
import {
  readFirstTouch,
  recordFirstTouch,
  type FirstTouch,
  type StorageLike,
} from "@/lib/leadSource";

/** Hostnames that are the site itself (any subdomain of each counts too). */
const SITE_HOSTS = ["tennisbootcamp.ca", "tennisbootcamp-seven.vercel.app"];

/**
 * Hosts the site sends a visitor through and back — Stripe Checkout, the
 * Supabase auth redirect, Google sign-in — never a source: a player coming
 * back from paying did not "come from Stripe". Treated exactly like own hosts
 * (subdomains included).
 */
export const PASS_THROUGH_HOSTS = [
  "checkout.stripe.com",
  "stripe.com",
  "supabase.co",
  "supabase.com",
  "accounts.google.com",
];

function storage(): StorageLike | null {
  try {
    const s = window.localStorage;
    return s ? s : null;
  } catch {
    return null;
  }
}

function ownHosts(): string[] {
  const hosts = [...SITE_HOSTS, ...PASS_THROUGH_HOSTS];
  try {
    hosts.push(new URL(SITE_URL).hostname);
  } catch {
    // SITE_URL always parses in practice; nothing to add otherwise
  }
  try {
    if (window.location.hostname) hosts.push(window.location.hostname);
  } catch {
    // no location: nothing to add
  }
  return hosts;
}

/** On a page load: store this visit's first touch unless one is already kept. */
export function captureFirstTouch(): void {
  if (typeof window === "undefined") return;
  const s = storage();
  if (!s) return;
  try {
    recordFirstTouch(s, {
      href: window.location.href,
      referrer: typeof document !== "undefined" ? document.referrer : "",
      ownHosts: ownHosts(),
      now: new Date(),
    });
  } catch {
    // never let attribution break a page
  }
}

/** The kept, unexpired record for the quiz to send; null for a direct visit. */
export function storedFirstTouch(): FirstTouch | null {
  if (typeof window === "undefined") return null;
  const s = storage();
  if (!s) return null;
  try {
    return readFirstTouch(s, new Date());
  } catch {
    return null;
  }
}

// Which account an enrollment row belongs to (audit H5). Pure, so
// src/scripts/test-enroll-access.ts can pin the rule; the I/O lives in
// src/lib/supabase/enrollmentActions.ts.
//
// Before this the row was inserted with no user_id and only the brand-new-
// email invite branch ever set one, so a player who took the quiz first (and
// so already had an account) paid and then saw "You haven't enrolled in any
// programs yet": the dashboard reads enrollments by user_id under RLS.

import { normalizeEmail } from "@/lib/supabase/adminUsers";

/**
 * The owner of a row being saved: the signed-in account (the person at the
 * keyboard), else nobody (backlog #84, owner 2026-11-14). A typed email proves
 * nothing, so a signed-out row is never owned by the account that exists for
 * that email: it stays unowned, and links when the address owner signs in
 * through their own emailed link (linkEnrollmentsToAccount, from
 * /auth/callback, which re-checks the address).
 */
export function enrollmentOwner(sessionUserId: string | null | undefined): string | null {
  return sessionUserId || null;
}

/**
 * Whether `email`'s rows may be attached to the account whose own address
 * is `accountEmail`: only when they are the same address (trimmed, case
 * aside). The account id and the email reach the link helper separately —
 * in the payment routes the email is the request body's, which the client
 * writes — so the helper never takes it on trust that they belong together.
 * Any other address's rows stay where they are.
 */
export function emailBelongsToAccount(
  accountEmail: string | null | undefined,
  email: string | null | undefined
): boolean {
  const target = normalizeEmail(email ?? "");
  return Boolean(target) && normalizeEmail(accountEmail ?? "") === target;
}

/**
 * The `ilike` pattern that matches exactly `literal` (case aside): `%`, `_`
 * and the escape character itself are escaped, so an address carrying one
 * reads only its own rows instead of every unowned row in the table. `*` is
 * left alone — PostgREST turns it into `%`, and escaping it would match a
 * literal `%` instead; the exact re-check below still picks the right row.
 */
export function ilikePattern(literal: string): string {
  return literal.replace(/[\\%_]/g, "\\$&");
}

/**
 * The re-check every `ilike` read on an email needs (backlog #84): PostgREST
 * reads `*` as `%`, which ilikePattern leaves alone, so a candidate row is
 * kept only when its address is exactly `email` (trimmed, case folded). A
 * `%`, `_` or `*` in a typed address then matches nothing but itself.
 */
export function rowsWithEmail<T>(
  rows: readonly T[],
  email: string,
  addressOf: (row: T) => string | null | undefined
): T[] {
  const target = normalizeEmail(email);
  if (!target) return [];
  return rows.filter((row) => normalizeEmail(addressOf(row) ?? "") === target);
}

export type UnownedEnrollmentRow = {
  id: string;
  contact_email: string | null;
  user_id: string | null;
};

/**
 * Ids of the rows that belong to `email` and no account owns yet. The
 * candidates come from a case-insensitive `ilike` on contact_email (its
 * wildcards escaped by ilikePattern), and the exact (trimmed, lowercased)
 * match is re-checked here before anything is written.
 */
export function enrollmentRowsToLink(rows: UnownedEnrollmentRow[], email: string): string[] {
  const target = normalizeEmail(email);
  if (!target) return [];
  return rows
    .filter((r) => r.user_id == null && normalizeEmail(r.contact_email ?? "") === target)
    .map((r) => r.id);
}

/**
 * What an email address hears after an enrollment is saved: a new address
 * gets the set-password link (the account is created for it); an address
 * that already has an account gets "You're enrolled" with a dashboard link —
 * never a second set-password email.
 */
export type EnrollmentNoticeKind = "set-password" | "enrolled";

export function enrollmentNoticeKind(accountExists: boolean): EnrollmentNoticeKind {
  return accountExists ? "enrolled" : "set-password";
}

/**
 * Which email an enrollment sends (owner, 2026-10-12; backlog #84):
 *   set-up    no account for the address (the invite creates it, with the
 *             set-password link), or an account never signed in to — once
 *             per cohort, unless the coach resends on purpose;
 *   enrolled  an account in use: "You're enrolled" and the dashboard link;
 *   none      the set-up email for this cohort already went out.
 * Choosing the email links nothing: rows link only when the address owner
 * signs in through their own emailed link.
 */
export function enrollmentNoticePlan(input: {
  accountExists: boolean;
  needsSetup: boolean;
  setupSentForCohort: boolean;
  force: boolean;
}): "set-up" | "enrolled" | "none" {
  if (!input.accountExists) return "set-up";
  if (!input.needsSetup) return "enrolled";
  return input.setupSentForCohort && !input.force ? "none" : "set-up";
}

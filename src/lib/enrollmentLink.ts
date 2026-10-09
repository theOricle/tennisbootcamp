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
 * The owner of a row being saved: the signed-in account when there is one
 * (the person at the keyboard paid), else the account that already exists
 * for the contact email, else nobody yet — the invite that creates the
 * account links the row the moment the account exists.
 */
export function enrollmentOwner(
  sessionUserId: string | null | undefined,
  lookupUserId: string | null | undefined
): string | null {
  return sessionUserId || lookupUserId || null;
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

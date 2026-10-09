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

export type UnownedEnrollmentRow = {
  id: string;
  contact_email: string | null;
  user_id: string | null;
};

/**
 * Ids of the rows that belong to `email` and no account owns yet. The
 * candidates come from a case-insensitive `ilike` on contact_email, in which
 * `_` is a one-character wildcard, so the exact (trimmed, lowercased) match
 * is re-checked here before anything is written.
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

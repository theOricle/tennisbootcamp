// Form validation, the pure half (audit M18, M19). Every public form keeps
// its primary button enabled, checks its fields when the button is pressed
// (and a field when it loses focus), and says what is wrong in plain words
// next to the field. These are the rules and the words; the components wire
// them to FieldError (src/components/ui/Input.tsx).
//
// No I/O, no React, so src/scripts/test-forms-a11y.ts can pin every message.

/** The human fallback every submit failure offers (voice.md, errors). */
export const INFO_EMAIL = "info@tennisbootcamp.ca";

/** The shortest phone number the quiz accepts, counted in digits. */
export const MIN_PHONE_DIGITS = 7;

/** The shortest password Supabase is configured to accept. */
export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Digits only: "(647) 555-1234" has 10. */
export function phoneDigitCount(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

export function isValidPhone(phone: string): boolean {
  return phoneDigitCount(phone) >= MIN_PHONE_DIGITS;
}

/** The words, in one place. Each says what is wrong and the one way out. */
export const FIELD_MESSAGES = {
  nameMissing: "Add your full name.",
  emailMissing: "Add your email address.",
  emailInvalid: "Check your email address. It should look like name@example.com.",
  phoneMissing: "Add a phone number Sina can text, like (647) 555-1234.",
  phoneInvalid: `Check the phone number. It needs at least ${MIN_PHONE_DIGITS} digits, like (647) 555-1234.`,
  passwordMissing: "Add your password.",
  passwordShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  passwordMismatch: "The two passwords don't match. Type the same password in both.",
  availabilityMissing: "Tap at least one time that works, or choose Skip for now.",
  slotMissing: "Pick a time above.",
  dobMissing: "Add a date of birth.",
  dobInvalid: "Check the date of birth.",
  consentMissing: "Tick the box to agree before you continue.",
  signatureMissing: "Type your full name to sign.",
} as const;

/** Null when the email is fine. */
export function emailError(value: string): string | null {
  if (!value.trim()) return FIELD_MESSAGES.emailMissing;
  return isValidEmail(value) ? null : FIELD_MESSAGES.emailInvalid;
}

/** Null when the phone is fine; an optional phone may be left empty. */
export function phoneError(value: string, { required = true } = {}): string | null {
  if (!value.trim()) return required ? FIELD_MESSAGES.phoneMissing : null;
  return isValidPhone(value) ? null : FIELD_MESSAGES.phoneInvalid;
}

/** Null when the name is fine. `missing` overrides the default words. */
export function requiredError(value: string, missing: string = FIELD_MESSAGES.nameMissing): string | null {
  return value.trim() ? null : missing;
}

/** Null when the new password is fine. */
export function newPasswordError(value: string): string | null {
  if (!value) return FIELD_MESSAGES.passwordMissing;
  return value.length >= MIN_PASSWORD_LENGTH ? null : FIELD_MESSAGES.passwordShort;
}

/**
 * A submit failure always ends with the human fallback (voice.md, errors). A
 * message that already names info@ is left as it is.
 */
export function withHumanFallback(message: string): string {
  const text = message.trim();
  if (text.includes(INFO_EMAIL)) return text;
  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  return `${sentence} If it keeps happening, email ${INFO_EMAIL}.`;
}

/**
 * Supabase's updateUser errors in plain words, each with the way out and the
 * human fallback, never the raw message (audit M19, M20).
 */
export function passwordUpdateErrorMessage(raw: string | null | undefined): string {
  const message = (raw ?? "").trim();
  if (/different from the old|same as the old|same_password/i.test(message)) {
    return withHumanFallback("Choose a password you haven't used on this account before.");
  }
  if (/session|jwt|expired|not authenticated|unauthori[sz]ed/i.test(message)) {
    return `This link has expired. Send yourself a new one from "Forgot password?" on the sign-in page, or email ${INFO_EMAIL}.`;
  }
  if (/weak|at least|too short|characters/i.test(message)) {
    return withHumanFallback(`That password is too easy to guess. ${FIELD_MESSAGES.passwordShort}`);
  }
  if (/failed to fetch|network|fetch failed|load failed/i.test(message)) {
    return `We couldn't reach the server. Check your connection and try again, or email ${INFO_EMAIL}.`;
  }
  return withHumanFallback("We couldn't save your password. Try again.");
}

/** One problem on a form: the field to focus and the words to show. */
export type FieldIssue = { id: string; message: string };

/** The first problem's field, for focus; null when the form is fine. */
export function firstIssueId(issues: readonly FieldIssue[]): string | null {
  return issues[0]?.id ?? null;
}

/** Issues keyed by field id, the shape the field components read. */
export function issuesById(issues: readonly FieldIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) if (!(issue.id in out)) out[issue.id] = issue.message;
  return out;
}

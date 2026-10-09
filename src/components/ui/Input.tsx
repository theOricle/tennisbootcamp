import type { ReactNode } from "react";
import { FOCUS_RING } from "@/components/ui/focus";

// Form primitives (audit M19, M23, L1, L7). One input look, one error
// pattern, one alert and one status region, so every public form behaves
// the same way for a keyboard or screen-reader user:
//
//   <label htmlFor={id}>…</label>
//   <input id={id} className={INPUT_CLASS} {...fieldA11y(id, { error })} />
//   <FieldError fieldId={id} message={error} />
//
// The primary button stays enabled; pressing it checks the fields, shows each
// problem under its field and moves focus to the first one.

/**
 * Text inputs, selects and textareas. The border is white/35 (about 3.1:1 on
 * the navy, WCAG 1.4.11), the placeholder white/45 (the floor for hint
 * text), and a field with an error turns its border red.
 */
export const INPUT_CLASS =
  "w-full rounded-2xl border border-white/35 bg-white/5 px-4 py-3 text-base text-white " +
  "placeholder:text-white/45 transition-colors hover:border-white/50 " +
  "aria-[invalid=true]:border-red-400 " +
  `${FOCUS_RING} md:text-sm`;

/** Field labels: white/75 on the navy. */
export const LABEL_CLASS = "text-sm text-white/75";

/** Helper text under a field: 12px at white/60, the floor for small text. */
export const HINT_CLASS = "text-xs text-white/60";

export function errorIdFor(fieldId: string): string {
  return `${fieldId}-error`;
}

export function hintIdFor(fieldId: string): string {
  return `${fieldId}-hint`;
}

/** aria-invalid and aria-describedby for one field (its hint, then its error). */
export function fieldA11y(
  fieldId: string,
  { error, hint = false }: { error?: string | null; hint?: boolean } = {}
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  const ids = [hint ? hintIdFor(fieldId) : null, error ? errorIdFor(fieldId) : null]
    .filter(Boolean)
    .join(" ");
  return {
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(ids ? { "aria-describedby": ids } : {}),
  };
}

/** The words under a field that has a problem. Renders nothing without one. */
export function FieldError({ fieldId, message }: { fieldId: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={errorIdFor(fieldId)} className="flex items-start gap-1.5 text-sm text-red-400">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mt-0.5 h-4 w-4 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.5a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4ZM10 14.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </p>
  );
}

/**
 * A submit failure: announced at once (role="alert") and always carrying the
 * info@ fallback in its words (see withHumanFallback).
 */
export function FormAlert({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * A polite live region that is always in the page, so a change of words
 * (sending, saved, copied) is announced without moving focus. Visually
 * hidden unless `visible`.
 */
export function LiveStatus({
  message,
  visible = false,
  className = "",
}: {
  message: string;
  visible?: boolean;
  className?: string;
}) {
  return (
    <p role="status" className={visible ? className : "sr-only"}>
      {message}
    </p>
  );
}

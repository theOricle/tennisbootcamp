"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FieldError, INPUT_CLASS, LABEL_CLASS, fieldA11y } from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { loginHref } from "@/lib/authFlow";
import {
  CODE_COPY,
  CODE_LENGTH,
  cleanCode,
  codeErrorMessage,
  type CodeErrorKind,
} from "@/lib/signInCode";

// The pieces the code page and the set-up page share (backlog #92): the
// /login page's own frame, card, field and button, so the second step looks
// like the first.

/**
 * The /login frame: top-aligned on phones, centred from md, one narrow column.
 * The set-up card is taller than a laptop screen, so from md the frame keeps
 * room above and below instead of sitting against the header.
 */
export function CodeShell({
  title,
  line,
  children,
}: {
  title: string;
  line: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-[calc(100svh-80px)] items-start justify-center bg-[#061427] px-6 pb-16 pt-10 text-white md:items-center md:py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-white/70">{line}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

/** The /login card. */
export const CODE_CARD_CLASS = "space-y-5 rounded-3xl border border-white/10 bg-white/5 p-8";

/**
 * The one 6-digit field: digits only, six at most, whatever is typed or
 * pasted ("123 456" from an app that shows the code with a space in it). The
 * phone's number pad opens, and a phone or password manager that holds the
 * code can offer it.
 */
export function CodeField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  error?: string | null;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {CODE_COPY.fieldLabel}
      </label>
      <input
        id={id}
        name="code"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        autoComplete="one-time-code"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={CODE_LENGTH}
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value))}
        onPaste={(e) => {
          // A pasted code may carry a space or a dash; maxLength would cut it
          // before it is cleaned, so the paste is cleaned by hand.
          e.preventDefault();
          onChange(cleanCode(e.clipboardData.getData("text")));
        }}
        placeholder="000000"
        required
        className={`${INPUT_CLASS} text-center font-mono text-lg tracking-[0.4em] tabular-nums md:text-lg`}
        {...fieldA11y(id, { error })}
      />
      <FieldError fieldId={id} message={error} />
    </div>
  );
}

/** The page's one main button: the /login lime button, with its spinner. */
export function CodeSubmit({ label, loading }: { label: string; loading: boolean }) {
  return (
    <button
      type="submit"
      aria-disabled={loading || undefined}
      className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 ${loading ? "cursor-wait opacity-80" : ""} ${FOCUS_RING}`}
    >
      {loading && (
        <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {loading ? CODE_COPY.checking : label}
    </button>
  );
}

/**
 * A refused code, in our words. A session that has run out is the one refusal
 * with somewhere to go: back to /login, keeping the page the visitor wanted.
 */
export function CodeError({ kind, nextPath }: { kind: CodeErrorKind | null; nextPath: string }) {
  if (!kind) return null;
  return (
    <div role="alert" className="text-sm text-red-400">
      <p>{codeErrorMessage(kind)}</p>
      {kind === "signedOut" && (
        <Link href={loginHref(nextPath)} className={TEXT_LINK_LIME}>
          {CODE_COPY.signInAgain}
        </Link>
      )}
    </div>
  );
}

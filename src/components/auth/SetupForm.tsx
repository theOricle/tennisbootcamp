"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { HINT_CLASS, LiveStatus } from "@/components/ui/Input";
import { buttonClass } from "@/components/ui/Button";
import {
  CODE_COPY,
  isCompleteCode,
  secretGroups,
  startSetup,
  submitCode,
  type CodeErrorKind,
  type MfaLike,
  type SetupStart,
} from "@/lib/signInCode";
import {
  CODE_CARD_CLASS,
  CodeError,
  CodeField,
  CodeShell,
  CodeSubmit,
} from "@/components/auth/CodeParts";

const FIELD_ID = "set-up-code";

type Stage =
  | { kind: "starting" }
  | { kind: "failed" }
  | { kind: "ready"; setup: Extract<SetupStart, { ok: true }> };

/** A step's number in the lime-tint ring the joining steps use. */
function StepHeading({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-sm font-semibold text-white">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#B4E655]/40 bg-[#B4E655]/[0.08] text-xs font-semibold text-[#B4E655]"
      >
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </h2>
  );
}

/**
 * The one-time set-up (backlog #92): the QR to scan, the same key as text
 * (the way in on the phone itself, and the backup), then one code to confirm
 * the app is paired. The server page decides who sees it.
 */
export function SetupForm({
  nextPath,
  mfa,
}: {
  nextPath: string;
  /** The MFA calls to use instead of the browser client's (tests). */
  mfa?: MfaLike;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "starting" });
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<CodeErrorKind | null>(null);
  const [loading, setLoading] = useState(false);
  // One enrollment per visit: a second one would strand the first as a
  // leftover (React runs an effect twice in development).
  const started = useRef(false);

  const enroll = useCallback(
    () =>
      startSetup(mfa ?? createClient().auth.mfa).then((setup) =>
        setStage(setup.ok ? { kind: "ready", setup } : { kind: "failed" })
      ),
    [mfa]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enroll();
  }, [enroll]);

  function startAgain() {
    setStage({ kind: "starting" });
    setErrorKind(null);
    setFieldError(null);
    setCode("");
    void enroll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || stage.kind !== "ready") return;
    if (!isCompleteCode(code)) {
      setFieldError(CODE_COPY.incomplete);
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    setFieldError(null);
    setErrorKind(null);
    setLoading(true);

    const result = await submitCode(mfa ?? createClient().auth.mfa, stage.setup.factorId, code);
    if (!result.ok) {
      setErrorKind(result.kind);
      setCode("");
      setLoading(false);
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    router.replace(nextPath);
    router.refresh();
  }

  // A set-up that has gone stale cannot take a code: its one way out is to
  // start again, so that takes the main button's place.
  const stale = errorKind === "setupStale";

  return (
    <CodeShell title={CODE_COPY.setupTitle} line={CODE_COPY.setupLine}>
      {stage.kind === "starting" && (
        <div className={CODE_CARD_CLASS}>
          <LiveStatus
            visible
            message={CODE_COPY.setupStarting}
            className="text-center text-sm text-white/70"
          />
        </div>
      )}

      {stage.kind === "failed" && (
        <div className={CODE_CARD_CLASS}>
          <p role="alert" className="text-sm text-red-400">
            {CODE_COPY.setupFailed}
          </p>
          <button type="button" onClick={startAgain} className={`${buttonClass("primary")} w-full`}>
            {CODE_COPY.tryAgain}
          </button>
        </div>
      )}

      {stage.kind === "ready" && (
        <form noValidate onSubmit={handleSubmit} className={CODE_CARD_CLASS}>
          <section className="space-y-4">
            <StepHeading n={1}>{CODE_COPY.setupScanStep}</StepHeading>
            {stage.setup.qr && (
              // A white tile with a quiet margin: a phone camera reads the
              // code off a computer screen held beside it. 224px on a phone's
              // card, 240px from md.
              <div className="mx-auto w-fit rounded-2xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL from the Auth server; next/image has nothing to optimize */}
                <img
                  src={stage.setup.qr}
                  alt={CODE_COPY.setupQrAlt}
                  width={240}
                  height={240}
                  className="block h-56 w-56 md:h-60 md:w-60"
                />
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm text-white/70">{CODE_COPY.setupKeyLine}</p>
              <div className="rounded-2xl border border-white/10 bg-[#061427] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
                  {CODE_COPY.setupKeyLabel}
                </p>
                {/* The groups are spaced by margin, so a copy takes the key whole. */}
                <p className="mt-1 select-all font-mono text-base text-white">
                  {secretGroups(stage.setup.secret).map((group, i) => (
                    <span key={i} className="mr-2 inline-block">
                      {group}
                    </span>
                  ))}
                </p>
              </div>
              <p className={HINT_CLASS}>{CODE_COPY.setupKeyHint}</p>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-5">
            <StepHeading n={2}>{CODE_COPY.setupCodeStep}</StepHeading>
            <CodeField
              id={FIELD_ID}
              value={code}
              error={fieldError}
              onChange={(next) => {
                setCode(next);
                if (fieldError && isCompleteCode(next)) setFieldError(null);
              }}
            />
          </section>

          <CodeError kind={errorKind} nextPath={nextPath} page="setup" />
          <LiveStatus message={loading ? CODE_COPY.checking : ""} />
          {stale ? (
            <button type="button" onClick={startAgain} className={`${buttonClass("primary")} w-full`}>
              {CODE_COPY.tryAgain}
            </button>
          ) : (
            <CodeSubmit label={CODE_COPY.setupButton} loading={loading} />
          )}
        </form>
      )}
    </CodeShell>
  );
}

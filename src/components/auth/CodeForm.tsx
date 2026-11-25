"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { LiveStatus } from "@/components/ui/Input";
import {
  CODE_COPY,
  isCompleteCode,
  submitCode,
  type CodeErrorKind,
  type MfaLike,
} from "@/lib/signInCode";
import {
  CODE_CARD_CLASS,
  CodeError,
  CodeField,
  CodeShell,
  CodeSubmit,
} from "@/components/auth/CodeParts";

const FIELD_ID = "sign-in-code";

/**
 * The code page (backlog #92): one field and one button. The server page
 * decides who sees it and hands over the confirmed factor's id; this form
 * only checks a code against it, then goes on to `nextPath`.
 */
export function CodeForm({
  factorId,
  nextPath,
  mfa,
}: {
  factorId: string;
  nextPath: string;
  /** The MFA calls to use instead of the browser client's (tests). */
  mfa?: MfaLike;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<CodeErrorKind | null>(null);
  const [loading, setLoading] = useState(false);

  // The page has one field and one job, so the cursor starts in it.
  useEffect(() => {
    document.getElementById(FIELD_ID)?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!isCompleteCode(code)) {
      setFieldError(CODE_COPY.incomplete);
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    setFieldError(null);
    setErrorKind(null);
    setLoading(true);

    const result = await submitCode(mfa ?? createClient().auth.mfa, factorId, code);
    if (!result.ok) {
      // A code is good for one try: clear it so the next one starts clean.
      setErrorKind(result.kind);
      setCode("");
      setLoading(false);
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <CodeShell title={CODE_COPY.codeTitle} line={CODE_COPY.codeLine}>
      <form noValidate onSubmit={handleSubmit} className={CODE_CARD_CLASS}>
        <CodeField
          id={FIELD_ID}
          value={code}
          error={fieldError}
          onChange={(next) => {
            setCode(next);
            if (fieldError && isCompleteCode(next)) setFieldError(null);
          }}
        />
        <CodeError kind={errorKind} nextPath={nextPath} />
        <LiveStatus message={loading ? CODE_COPY.checking : ""} />
        <CodeSubmit label={CODE_COPY.codeButton} loading={loading} />
      </form>
    </CodeShell>
  );
}

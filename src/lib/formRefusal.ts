// A public form the server refused for too many tries (backlog #84, review
// fix 8). The route answers 429 with its own plain line; the form shows that
// line instead of its generic "Something went wrong", which would send the
// family straight back into another refused try.
//
// Client-safe: no server imports, so the quiz and the newsletter and
// program-interest forms can use it. The routes read the same line through
// src/lib/submissionLimits.ts.

/**
 * The 429 a refused submission answers: what to do, and the inbox — never
 * which limit, how many, or when it lifts. Also what a form shows when a
 * 429's body cannot be read.
 */
export const SUBMISSION_LIMIT_ERROR =
  "Too many tries in a short time. Please wait a while and try again, or email info@tennisbootcamp.ca.";

/** A submission the server refused; its message is the line to show. */
export class FormRefusal extends Error {
  constructor(line: string) {
    super(line);
    this.name = "FormRefusal";
  }
}

/**
 * The route's own line for a refused try (a 429), or null for any other
 * answer. Reads the body, so call it only on a response not read yet.
 */
export async function refusedLine(res: Response): Promise<string | null> {
  if (res.status !== 429) return null;
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const line = typeof data?.error === "string" ? data.error.trim() : "";
  return line || SUBMISSION_LIMIT_ERROR;
}

/**
 * What a form's failed submit throws: a FormRefusal carrying the route's line
 * for a refused try, else a plain error, so the form keeps its own line.
 */
export async function submitFailure(res: Response): Promise<Error> {
  const line = await refusedLine(res);
  return line ? new FormRefusal(line) : new Error(`Submission failed (${res.status})`);
}

// Run from project root: npx tsx src/scripts/test-invite-delivery.ts
// Pins what the coach is told after pressing "Send invites".
//
// The bug this guards: the Resend SDK RESOLVES with `{ data, error }` when the
// provider refuses a message — it does not throw. Every send in the app was
// awaited without reading `error`, so a refused invite email reported success
// and the admin screen said "Sent 1" while the player heard nothing.
// A notice must never claim an email went out that didn't.

import { formatResendError, inviteNotice } from "../lib/emailResult";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

// ─── formatResendError ────────────────────────────────────────────────────────

console.log("formatResendError");
check(
  "name + status + message",
  formatResendError({
    name: "validation_error",
    statusCode: 403,
    message: "The tennisbootcamp.ca domain is not verified.",
  }),
  "validation_error HTTP 403: The tennisbootcamp.ca domain is not verified."
);
check(
  "message only",
  formatResendError({ message: "Rate limit exceeded" }),
  "Rate limit exceeded"
);
check(
  "name only",
  formatResendError({ name: "application_error" }),
  "application_error"
);
check("null error still reads", formatResendError(null), "unknown error");
check("empty object still reads", formatResendError({}), "unknown error");
check(
  "a zero status code is still reported",
  formatResendError({ name: "x", statusCode: 0, message: "m" }),
  "x HTTP 0: m"
);

// ─── inviteNotice ─────────────────────────────────────────────────────────────

console.log("inviteNotice");
check(
  "everything delivered",
  inviteNotice({ created: 2, emailed: 2, errors: [] }),
  "Sent 2 invites."
);
check(
  "one delivered reads singular",
  inviteNotice({ created: 1, emailed: 1, errors: [] }),
  "Sent 1 invite."
);
check(
  "nothing created",
  inviteNotice({ created: 0, emailed: 0, errors: ["bad@ doesn't look like an email."] }),
  "No invites went out. bad@ doesn't look like an email."
);

// The production symptom: rows written, provider refused every message.
check(
  "spots held but no email left the building",
  inviteNotice({
    created: 1,
    emailed: 0,
    errors: ["a@example.com: spot held, but the email didn't go out (403). Re-invite to retry."],
  }),
  "Held 1 spot, but no email went out. " +
    "a@example.com: spot held, but the email didn't go out (403). Re-invite to retry."
);
check(
  "email unconfigured — never reported as sent",
  inviteNotice({
    created: 2,
    emailed: 0,
    errors: ["Email is not configured (RESEND_API_KEY is unset), so no invite email was sent."],
  }),
  "Held 2 spots, but no email went out. " +
    "Email is not configured (RESEND_API_KEY is unset), so no invite email was sent."
);
check(
  "partial delivery names both numbers",
  inviteNotice({ created: 3, emailed: 2, errors: ["c@example.com: spot held, but the email didn't go out (bounce)."] }),
  "Held 3 spots · emailed 2. c@example.com: spot held, but the email didn't go out (bounce)."
);

// The invariant behind all of it.
console.log("invariant");
for (const [created, emailed] of [[1, 0], [2, 0], [3, 1], [5, 4]] as const) {
  const notice = inviteNotice({ created, emailed, errors: [] });
  check(
    `created ${created} / emailed ${emailed} never claims "Sent ${created}"`,
    notice.startsWith(`Sent ${created}`),
    false
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");

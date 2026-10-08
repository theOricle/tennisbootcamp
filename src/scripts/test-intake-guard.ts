// Run from project root: npx tsx src/scripts/test-intake-guard.ts
// Pins the /api/intake order of operations (src/lib/intakeGuard.ts, backlog
// #25): the bot check decides first, then validation, and only an accepted
// body reaches the Sheet / account / email code. Also pins that the accepted
// body builds a byte-identical Sheet row — the column contract is untouched.
// Exits non-zero on any failure.

import {
  HONEYPOT_FIELD,
  FILL_TIME_FIELD,
  MIN_FILL_TIME_MS,
  TEXT_LIMITS,
} from "../lib/botCheck";
import {
  decideIntake,
  sanitizeIntakeBody,
  INTAKE_INVALID_EMAIL,
} from "../lib/intakeGuard";
import { buildIntakeRow, INTAKE_ALL_HEADERS } from "../lib/intakeRow";

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

// What src/app/intake/page.tsx sends today, plus the two protection fields.
const wizard = {
  household: { selectedIds: [], profiles: {}, guests: [] },
  goals: [],
  programs: ["bootcamp"],
  preferredLocationIds: [],
  availability: { days: { mon: ["eve"], wed: ["mor", "eve"] }, v: 1 },
  newsletter: true,
  name: "Maya Chen",
  phone: "(647) 555-1234",
  email: "maya@example.com",
  who: "adult",
  level: "intermediate",
  ageBand: "adult",
  notes: "",
  area: "",
  recommendedProgram: "adult-bootcamps",
  participantIds: [],
  participantProfiles: {},
  participants: [
    { name: "Sam Chen", relationship: "child", isMinor: true, ageBand: "junior", selfLevel: "new" },
  ],
};
const protection = { [HONEYPOT_FIELD]: "", [FILL_TIME_FIELD]: MIN_FILL_TIME_MS + 4000 };
const human = { ...wizard, ...protection };

// ─── Order of operations ─────────────────────────────────────────────────────

console.log("order of operations");

check(
  "a real submission is accepted",
  decideIntake(human).action,
  "accept"
);
check(
  "honeypot filled → drop",
  decideIntake({ ...human, [HONEYPOT_FIELD]: "http://x", website: "legacy key is just data" }),
  { action: "drop", reason: "honeypot" }
);
check(
  "too fast → drop",
  decideIntake({ ...human, [FILL_TIME_FIELD]: 300 }),
  { action: "drop", reason: "too_fast" }
);
check(
  "no fill time (raw script) → drop",
  decideIntake(wizard),
  { action: "drop", reason: "no_fill_time" }
);
check(
  "a bot with an invalid email is dropped, not rejected (bot check runs first)",
  decideIntake({ ...human, email: "nope", [HONEYPOT_FIELD]: "x" }),
  { action: "drop", reason: "honeypot" }
);
check(
  "a drop carries no personal data",
  Object.keys(decideIntake({ ...human, [HONEYPOT_FIELD]: "x" })).sort(),
  ["action", "reason"]
);
check(
  "invalid email → 400 with the message",
  decideIntake({ ...human, email: "maya@example" }),
  { action: "reject", status: 400, error: INTAKE_INVALID_EMAIL }
);
check(
  "missing email → 400",
  decideIntake({ ...human, email: undefined }).action,
  "reject"
);
check(
  "a non-object body with the bot fields is still rejected, never accepted",
  decideIntake("just a string").action,
  "drop"
);

// ─── The accepted body ───────────────────────────────────────────────────────

console.log("accepted body");

const accepted = decideIntake(human);
if (accepted.action !== "accept") throw new Error("expected accept");

check(
  "bot fields are gone",
  HONEYPOT_FIELD in accepted.body || FILL_TIME_FIELD in accepted.body,
  false
);
check(
  "every wizard field survives with the same name",
  Object.keys(accepted.body).sort(),
  Object.keys(wizard).sort()
);
check(
  "a clean wizard body is unchanged value for value",
  accepted.body,
  wizard
);

const ts = "2026-10-07T12:00:00.000Z";
check(
  "the Sheet row built from the accepted body is byte-identical to the raw one",
  buildIntakeRow(accepted.body, ts),
  buildIntakeRow(wizard, ts)
);
check(
  "the row still has the frozen 17 cells (no protection column crept in)",
  buildIntakeRow(accepted.body, ts).length,
  17
);
check(
  "the full header row still has 22 columns",
  INTAKE_ALL_HEADERS.length,
  22
);
check(
  "no header mentions the protection fields",
  (INTAKE_ALL_HEADERS as readonly string[]).some(
    (h) => h === HONEYPOT_FIELD || h === FILL_TIME_FIELD
  ),
  false
);

// ─── Input limits ─────────────────────────────────────────────────────────────

console.log("input limits");

const messy = decideIntake({
  ...human,
  name: "  " + "N".repeat(500) + "  ",
  email: "  maya@example.com  ",
  phone: "1".repeat(100),
  notes: "n".repeat(5000),
  area: "a".repeat(1000),
  goals: Array.from({ length: 100 }, () => "g".repeat(200)),
  participants: Array.from({ length: 20 }, () => ({
    name: " " + "p".repeat(300),
    relationship: "child",
    isMinor: true,
    ageBand: "junior",
    selfLevel: "r".repeat(300),
  })),
});
if (messy.action !== "accept") throw new Error("expected accept");
const m = messy.body as Record<string, unknown>;
check("name trimmed and capped", (m.name as string).length, TEXT_LIMITS.name);
check("email trimmed", m.email, "maya@example.com");
check("phone capped", (m.phone as string).length, TEXT_LIMITS.phone);
check("notes capped", (m.notes as string).length, TEXT_LIMITS.note);
check("area capped", (m.area as string).length, TEXT_LIMITS.area);
check("goals list capped to 50 items", (m.goals as string[]).length, 50);
check("each goal capped", (m.goals as string[])[0].length, TEXT_LIMITS.short);
check("participants capped to 10", (m.participants as unknown[]).length, 10);
check(
  "participant name trimmed and capped",
  ((m.participants as { name: string }[])[0].name).length,
  TEXT_LIMITS.name
);
check(
  "participant non-text fields untouched",
  (m.participants as { isMinor: boolean; relationship: string }[])[0].isMinor,
  true
);

check(
  "sanitize keeps non-string values exactly (newsletter flag, availability grid)",
  (() => {
    const s = sanitizeIntakeBody({ newsletter: true, availability: { days: {}, v: 1 }, level: null });
    return [s.newsletter, s.availability, s.level];
  })(),
  [true, { days: {}, v: 1 }, null]
);
check(
  "sanitize never adds keys",
  Object.keys(sanitizeIntakeBody({ email: "a@b.co" })),
  ["email"]
);

// ─── Done ─────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll intake-guard tests passed.");

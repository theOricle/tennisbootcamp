// Run from project root: npx tsx src/scripts/test-bot-check.ts
// Pins the bot check behind the four public forms (src/lib/botCheck.ts,
// backlog #25): honeypot, minimum fill time, field stripping, the body-size
// cap and the input limits. Exits non-zero on any failure.

import {
  HONEYPOT_FIELD,
  FILL_TIME_FIELD,
  MIN_FILL_TIME_MS,
  MAX_BODY_BYTES,
  bodyTooLarge,
  checkBot,
  cleanText,
  isValidEmail,
  stripBotFields,
  TEXT_LIMITS,
} from "../lib/botCheck";

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

const human = {
  email: "player@example.com",
  [HONEYPOT_FIELD]: "",
  [FILL_TIME_FIELD]: MIN_FILL_TIME_MS + 1500,
};

// ─── Honeypot ─────────────────────────────────────────────────────────────────

console.log("honeypot");
check("empty honeypot passes", checkBot(human), { bot: false });
check(
  "filled honeypot is a bot",
  checkBot({ ...human, [HONEYPOT_FIELD]: "https://spam.example" }),
  { bot: true, reason: "honeypot" }
);
check(
  "whitespace-only honeypot passes (nothing was typed)",
  checkBot({ ...human, [HONEYPOT_FIELD]: "   " }),
  { bot: false }
);
check(
  "non-string honeypot value is a bot",
  checkBot({ ...human, [HONEYPOT_FIELD]: 1 }),
  { bot: true, reason: "honeypot" }
);
check(
  "honeypot wins over fill time",
  checkBot({ ...human, [HONEYPOT_FIELD]: "x", [FILL_TIME_FIELD]: 10 }),
  { bot: true, reason: "honeypot" }
);

// ─── Minimum fill time ────────────────────────────────────────────────────────

console.log("fill time");
check("threshold is 2 seconds", MIN_FILL_TIME_MS, 2000);
check(
  "under the threshold is a bot",
  checkBot({ ...human, [FILL_TIME_FIELD]: MIN_FILL_TIME_MS - 1 }),
  { bot: true, reason: "too_fast" }
);
check(
  "exactly the threshold passes",
  checkBot({ ...human, [FILL_TIME_FIELD]: MIN_FILL_TIME_MS }),
  { bot: false }
);
check(
  "a long fill passes",
  checkBot({ ...human, [FILL_TIME_FIELD]: 10 * 60 * 1000 }),
  { bot: false }
);
check(
  "missing fill time is a bot (raw-JSON script)",
  checkBot({ email: human.email, [HONEYPOT_FIELD]: "" }),
  { bot: true, reason: "no_fill_time" }
);
check(
  "null fill time is a bot",
  checkBot({ ...human, [FILL_TIME_FIELD]: null }),
  { bot: true, reason: "no_fill_time" }
);
check(
  "string fill time is a bot (not a number)",
  checkBot({ ...human, [FILL_TIME_FIELD]: "5000" }),
  { bot: true, reason: "no_fill_time" }
);
check("empty body is a bot", checkBot({}), { bot: true, reason: "no_fill_time" });
check("non-object body is a bot", checkBot("hello"), { bot: true, reason: "no_fill_time" });
check("array body is a bot", checkBot([1, 2]), { bot: true, reason: "no_fill_time" });

// ─── Stripping ────────────────────────────────────────────────────────────────

console.log("stripBotFields");
check(
  "removes exactly the two fields, keeps everything else",
  stripBotFields({ a: 1, b: "two", ...human }),
  { a: 1, b: "two", email: human.email }
);
check("does not mutate its input", (() => {
  const input = { ...human };
  stripBotFields(input);
  return Object.keys(input).sort();
})(), ["email", FILL_TIME_FIELD, HONEYPOT_FIELD].sort());
check("passes non-objects through", stripBotFields("x" as unknown), "x");

// ─── Body size ────────────────────────────────────────────────────────────────

console.log("body size");
check("cap is 20 KB", MAX_BODY_BYTES, 20480);
check("a normal body is fine", bodyTooLarge(JSON.stringify(human), null), false);
check("exactly the cap is fine", bodyTooLarge("x".repeat(MAX_BODY_BYTES), null), false);
check("one byte over is too large", bodyTooLarge("x".repeat(MAX_BODY_BYTES + 1), null), true);
check(
  "multi-byte characters count in bytes, not characters",
  bodyTooLarge("é".repeat(MAX_BODY_BYTES / 2 + 1), null),
  true
);
check(
  "an oversized content-length header is refused before reading",
  bodyTooLarge("{}", String(MAX_BODY_BYTES + 1)),
  true
);
check("a wrong but small content-length is ignored", bodyTooLarge("{}", "abc"), false);

// ─── Input limits ─────────────────────────────────────────────────────────────

console.log("input limits");
check("cleanText trims", cleanText("  Maya  ", TEXT_LIMITS.name), "Maya");
check(
  "cleanText caps after trimming",
  cleanText(" " + "a".repeat(200), TEXT_LIMITS.name),
  "a".repeat(TEXT_LIMITS.name)
);
check("cleanText passes non-strings through", cleanText(42, 10), 42);
check("cleanText passes undefined through", cleanText(undefined, 10), undefined);
check("cleanText passes null through", cleanText(null, 10), null);

check("valid email", isValidEmail("player@example.com"), true);
check("email with spaces is invalid", isValidEmail("player @example.com"), false);
check("email without domain dot is invalid", isValidEmail("player@example"), false);
check("empty email is invalid", isValidEmail(""), false);
check("non-string email is invalid", isValidEmail(null), false);
check(
  "an email over the cap is invalid",
  isValidEmail("a".repeat(TEXT_LIMITS.email) + "@example.com"),
  false
);

// ─── Done ─────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll bot-check tests passed.");

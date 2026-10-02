// Run from project root: npx tsx src/scripts/test-privacy.ts
// Pins backlog #23: GA never sees a query string (invite tokens), and every
// group invitation carries the CASL sender and unsubscribe lines.

import { withoutQuery, GA_STRIP_QUERY_SCRIPT } from "../lib/analytics";
import { senderLine, unsubscribeLine, commercialFooterText } from "../lib/casl";

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

console.log("withoutQuery");
check(
  "invite token dropped",
  withoutQuery("https://tennisbootcamp.ca/enroll/abc?invite=tok123"),
  "https://tennisbootcamp.ca/enroll/abc"
);
check(
  "Stripe return params dropped",
  withoutQuery("https://tennisbootcamp.ca/enroll/abc/confirmed?row=4&session_id=cs_x&invite=1"),
  "https://tennisbootcamp.ca/enroll/abc/confirmed"
);
check("hash dropped", withoutQuery("https://tennisbootcamp.ca/programs#fall"), "https://tennisbootcamp.ca/programs");
check("empty referrer stays empty", withoutQuery(""), "");

// The inline script runs before the bundle; run it against a fake window and
// read what it hands gtag.
console.log("GA_STRIP_QUERY_SCRIPT");
const fakeWindow: { dataLayer?: IArguments[]; location: { href: string } } = {
  location: { href: "https://tennisbootcamp.ca/enroll/abc?invite=tok123" },
};
const fakeDocument = { referrer: "https://tennisbootcamp.ca/legal/waiver?invite=tok123" };
new Function("window", "document", GA_STRIP_QUERY_SCRIPT)(fakeWindow, fakeDocument);
const pushed = (fakeWindow.dataLayer ?? []).map((args) => Array.from(args));
check("sets trimmed location and referrer before config", pushed, [
  [
    "set",
    {
      page_location: "https://tennisbootcamp.ca/enroll/abc",
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

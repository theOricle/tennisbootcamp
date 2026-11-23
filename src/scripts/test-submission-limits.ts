// Run from project root: npx tsx src/scripts/test-submission-limits.ts
//
// Pins backlog #84 part 6 (audit follow-up, owner 2026-11-14): limits on
// repeated submissions to the public forms, and the bot check on the three
// payment routes.
//
//   1. Per network address and per email, on the quiz, the booking, enroll,
//      checkout, e-transfer, the newsletter and program interest
//      (reset-password keeps its own cooldown). The numbers let a family
//      entering two children and retrying once through; a script on one
//      address cannot spend the day's 100 transactional emails.
//   2. The count is atomic: a try records its hit first, then counts the
//      window and takes its own hit back when it is over. Fifty tries at the
//      same moment never all see an empty count (a fake store interleaves
//      them here). A try the route refuses for its own reasons is taken back.
//   3. A refusal is one plain line (429) with nothing an attacker can use:
//      not which limit, not how many, not when.
//   4. One additive table (migration 0011): RLS on, with one rule that
//      refuses visitors and accounts every row, written only by the server. It stores keyed hashes, never an
//      address or an email, and rows older than a day are deleted. Until the
//      migration runs the routes work as before and log one warning.
//   5. Checkout, enroll and e-transfer run the existing bot check (honeypot
//      and fill time), with the fields sent from the sign-up wizard.
//
// Pure: it calls pure functions, drives the count with an in-memory store
// and reads source files. No network, no database, no env. Exits non-zero
// on any failure.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LIMITS,
  LIMIT_SCOPES,
  MAIL_SCOPES,
  SUBMISSION_LIMIT_ERROR,
  clientAddress,
  isMissingTable,
  limitKeyHash,
  limitVerdict,
  takeTicket,
  type LimitScope,
  type LimitStore,
  type StoredHit,
} from "../lib/submissionLimits";
import { FormRefusal, refusedLine, submitFailure } from "../lib/formRefusal";

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

const SECRET = "test-secret-not-a-real-key";
const MIN = 60_000;
const START = Date.parse("2026-11-20T09:00:00.000Z");

// ─── An in-memory table, with a scheduler that can interleave calls ──────────

/** Yields between every store call, a random number of turns when `shuffle` is on. */
function scheduler(shuffle: boolean, seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return async () => {
    const turns = shuffle ? 1 + Math.floor(rand() * 4) : 1;
    for (let i = 0; i < turns; i++) await new Promise<void>((r) => setImmediate(r));
  };
}

function makeTable(clock: () => number, pause: () => Promise<void> = async () => {}) {
  const rows: StoredHit[] = [];
  const inserted: { scope: string; key_hash: string }[] = [];
  let n = 0;
  const store: LimitStore = {
    async insert(hits) {
      await pause();
      inserted.push(...hits);
      const createdAt = new Date(clock()).toISOString();
      return hits.map((h) => {
        const id = `hit_${++n}`;
        rows.push({ id, key_hash: h.key_hash, scope: h.scope, created_at: createdAt });
        return id;
      });
    },
    async readWindow(keys, since) {
      await pause();
      return rows.filter((r) => keys.includes(r.key_hash) && r.created_at > since).map((r) => ({ ...r }));
    },
    async remove(ids) {
      await pause();
      for (const id of ids) {
        const i = rows.findIndex((r) => r.id === id);
        if (i !== -1) rows.splice(i, 1);
      }
    },
  };
  return { rows, inserted, store };
}

/** One try, as a route makes it. */
async function submit(store: LimitStore, scope: LimitScope, address: string, email: string | null, at: number) {
  const ticket = await takeTicket(store, { secret: SECRET, scope, address, email, now: at });
  if (ticket === "missing") throw new Error("the fake table is always there");
  return ticket;
}

/** Transactional emails a submission can send, at most (src/lib/email.ts via each route). */
const EMAILS_PER_SUBMISSION: Record<LimitScope, number> = {
  intake: 2, // the quiz result, the set-password email
  book: 3, // request received, the inbox notice, the set-password email
  etransfer: 3, // the instructions, the inbox notice, the account email
  enroll: 0,
  checkout: 0, // the account email follows the payment, not the submit
  newsletter: 0, // MailerLite's own, not ours
  interest: 0,
};

async function main() {
  // ─── 1. The numbers ─────────────────────────────────────────────────────────

  console.log("The numbers");
  {
    check("seven forms are limited", [...LIMIT_SCOPES], ["intake", "book", "enroll", "checkout", "etransfer", "newsletter", "interest"]);
    check("the forms that send our email", [...MAIL_SCOPES], ["intake", "book", "etransfer"]);
    check("per address, per form: 20 an hour, 30 a day", LIMITS.perAddress, { hour: 20, day: 30 });
    check("per email, per form: 5 an hour, 10 a day", LIMITS.perEmail, { hour: 5, day: 10 });
    check("across the email-sending forms: 20 a day per address, 12 per email", LIMITS.mail, { addressDay: 20, emailDay: 12 });
  }

  console.log("Scenario — a family entering two children and retrying once is never refused");
  {
    const t = { now: START };
    const { store } = makeTable(() => t.now);
    let refused = 0;
    // Every form, each child separately, each retried once: the most a family
    // would ever send in one day from one home and one inbox.
    for (const scope of LIMIT_SCOPES) {
      for (let i = 0; i < 4; i++) {
        if (!(await submit(store, scope, "203.0.113.7", "dana@example.com", t.now)).allowed) refused++;
        t.now += 2 * MIN;
      }
    }
    check("28 submissions in under an hour, none refused", refused, 0);
  }

  console.log("Scenario — a script on one address cannot spend the day's 100 emails");
  {
    const t = { now: START };
    const { store } = makeTable(() => t.now);
    let sent = 0;
    // A day of submissions, a new email each time, cycling through the forms
    // that send email, every two minutes.
    for (let i = 0; i < 720; i++) {
      const scope = MAIL_SCOPES[i % MAIL_SCOPES.length];
      if ((await submit(store, scope, "198.51.100.9", `victim${i}@example.com`, t.now)).allowed) {
        sent += EMAILS_PER_SUBMISSION[scope];
      }
      t.now += 2 * MIN;
    }
    check("at most 60 emails in a day (20 submissions × 3)", sent <= 60);
    check("…well under the 100 a day", sent < 100);
  }

  console.log("Scenario — a sign-up evening at the club, twenty families on one Wi-Fi inside one hour");
  {
    const t = { now: Date.parse("2026-11-20T23:00:00.000Z") };
    const { store } = makeTable(() => t.now);
    const through: boolean[] = [];
    // Each family sends its e-transfer (an email-sending form), one every
    // three minutes, all from the club's one address: twenty inside the hour.
    for (let i = 0; i < 20; i++) {
      through.push((await submit(store, "etransfer", "203.0.113.200", `family${i}@example.com`, t.now)).allowed);
      t.now += 3 * MIN;
    }
    check("the eleventh family inside the hour goes through", through[10]);
    check("all twenty go through", through.filter(Boolean).length, 20);
    check("a twenty-first email-sending try from that address that day is refused", (await submit(store, "intake", "203.0.113.200", "late@example.com", t.now)).allowed, false);
  }

  console.log("Scenario — one inbox, hammered from many addresses");
  {
    const t = { now: START };
    const { store } = makeTable(() => t.now);
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      if ((await submit(store, "intake", `192.0.2.${i}`, "dana@example.com", t.now)).allowed) allowed++;
      t.now += MIN;
    }
    check("five quizzes an hour for one email, whatever the address", allowed, 5);
  }

  console.log("Scenario — the windows slide, and a refusal is not counted");
  {
    const t = { now: START };
    const { store, rows } = makeTable(() => t.now);
    for (let i = 0; i < 5; i++) {
      await submit(store, "newsletter", "203.0.113.1", "a@example.com", t.now);
      t.now += MIN;
    }
    t.now = START + 10 * MIN;
    check("the sixth in the hour is refused", (await submit(store, "newsletter", "203.0.113.1", "a@example.com", t.now)).allowed, false);
    check("…and takes its own hit back", rows.length, 10);
    t.now = START + 70 * MIN;
    check("an hour later it goes through", (await submit(store, "newsletter", "203.0.113.1", "a@example.com", t.now)).allowed, true);
  }

  // ─── 2. Atomic under concurrency ────────────────────────────────────────────

  console.log("Concurrency — fifty tries at the same moment");
  {
    // Every try records its hit before any of them counts: the worst case for
    // a read-then-write limiter, which would let all fifty through.
    const t = { now: START };
    const table = makeTable(() => t.now, scheduler(false));
    const tickets = await Promise.all(
      Array.from({ length: 50 }, (_, i) => submit(table.store, "intake", "198.51.100.9", `n${i}@example.com`, t.now))
    );
    const allowed = tickets.filter((x) => x.allowed).length;
    check("never more than the 20 an hour one address may send", allowed <= LIMITS.perAddress.hour);
    check("every refused try took its hit back (two rows per allowed try)", table.rows.length, allowed * 2);

    // The same fifty, read-then-decide-then-write, for contrast: this is the
    // race the count closes.
    const naive = makeTable(() => t.now, scheduler(false));
    const naiveAllowed = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const addressHash = limitKeyHash(SECRET, "address", "198.51.100.9");
        const emailHash = limitKeyHash(SECRET, "email", `n${i}@example.com`);
        const seen = await naive.store.readWindow([addressHash, emailHash], new Date(t.now - 24 * 60 * MIN).toISOString());
        const { allowed } = limitVerdict({
          scope: "intake",
          addressHash,
          emailHash,
          hits: seen.map((r) => ({ keyHash: r.key_hash, scope: r.scope, createdAt: r.created_at })),
          now: t.now,
        });
        if (allowed) await naive.store.insert([{ scope: "intake", key_hash: addressHash }, { scope: "intake", key_hash: emailHash }]);
        return allowed;
      })
    );
    check("(a read-then-write count lets all fifty through)", naiveAllowed.filter(Boolean).length, 50);
  }

  console.log("Concurrency — any interleaving keeps the limit");
  {
    let worst = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const t = { now: START };
      const table = makeTable(() => t.now, scheduler(true, seed));
      const tickets = await Promise.all(
        Array.from({ length: 40 }, (_, i) => submit(table.store, "book", "198.51.100.9", `m${i}@example.com`, t.now))
      );
      worst = Math.max(worst, tickets.filter((x) => x.allowed).length);
    }
    check("25 random interleavings of 40 tries: never more than 20 through", worst <= LIMITS.perAddress.hour);
    const t = { now: START };
    const calm = makeTable(() => t.now);
    let one = 0;
    for (let i = 0; i < 40; i++) if ((await submit(calm.store, "book", "198.51.100.9", `m${i}@example.com`, t.now)).allowed) one++;
    check("one at a time, exactly 20 go through", one, 20);
  }

  console.log("release — a try the route refused for its own reasons is not counted");
  {
    const t = { now: START };
    const { store, rows } = makeTable(() => t.now);
    for (let i = 0; i < 4; i++) await submit(store, "book", "203.0.113.5", "dana@example.com", t.now);
    const fifth = await submit(store, "book", "203.0.113.5", "dana@example.com", t.now);
    check("the fifth try is allowed", fifth.allowed);
    await fifth.release(); // e.g. the slot was just taken
    check("…and after a taken slot, it is taken back", rows.length, 8);
    check("so the family's next try still goes through", (await submit(store, "book", "203.0.113.5", "dana@example.com", t.now)).allowed);
  }

  // ─── 3. What is stored, and what a refusal says ─────────────────────────────

  console.log("limitKeyHash — a keyed hash, never the value");
  {
    const h = limitKeyHash(SECRET, "email", "dana@example.com");
    check("64 hex characters", /^[0-9a-f]{64}$/.test(h));
    check("the same input, the same hash", limitKeyHash(SECRET, "email", "dana@example.com"), h);
    check("an address and an email of the same text differ", limitKeyHash(SECRET, "address", "dana@example.com") === h, false);
    check("another secret, another hash", limitKeyHash("another-secret", "email", "dana@example.com") === h, false);
    check("the value does not appear in it", h.includes("dana"), false);
  }

  console.log("The store is only ever handed keyed hashes");
  {
    const t = { now: START };
    const table = makeTable(() => t.now);
    await submit(table.store, "intake", "203.0.113.7", " Dana@Example.com ", t.now);
    await submit(table.store, "newsletter", "2001:db8::1", null, t.now);
    const all = JSON.stringify(table.inserted);
    check("every key it writes is 64 hex characters (the table's own check)", table.inserted.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash)));
    check("the address it writes is limitKeyHash of the address", table.inserted[0].key_hash, limitKeyHash(SECRET, "address", "203.0.113.7"));
    check("the email it writes is limitKeyHash of the normalized email", table.inserted[1].key_hash, limitKeyHash(SECRET, "email", "dana@example.com"));
    check("no raw address or email reaches the store", /203\.0\.113\.7|dana|example\.com|2001:db8/.test(all), false);
    check("a try with no email writes the address only", table.inserted.length, 3);
  }

  console.log("clientAddress — the network address Vercel reports");
  {
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
    check("the first x-forwarded-for entry", clientAddress(headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })), "203.0.113.7");
    check("else x-real-ip", clientAddress(headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
    check("else unknown (all such requests share one bucket)", clientAddress(headers({})), "unknown");
    // IPv6 is keyed by its /64: one home or office holds a whole /64, so
    // counting single addresses would let one script rotate through it.
    check("IPv6: two addresses in one /64 are one key", [
      clientAddress(headers({ "x-forwarded-for": "2001:db8:abcd:12:1:2:3:4" })),
      clientAddress(headers({ "x-forwarded-for": "2001:DB8:ABCD:12::5" })),
    ], ["2001:db8:abcd:12::/64", "2001:db8:abcd:12::/64"]);
    check("IPv6: the next /64 is another key", clientAddress(headers({ "x-forwarded-for": "2001:db8:abcd:13::1" })), "2001:db8:abcd:13::/64");
    check("IPv6: a short form expands", clientAddress(headers({ "x-forwarded-for": "2001:db8::1" })), "2001:db8:0:0::/64");
    check("IPv6: leading zeros fold", clientAddress(headers({ "x-forwarded-for": "2001:0db8:0000:0012::9" })), "2001:db8:0:12::/64");
    check("IPv6: brackets and a zone are dropped", clientAddress(headers({ "x-real-ip": "[fe80::1%eth0]" })), "fe80:0:0:0::/64");
    check("an IPv4-mapped IPv6 address is its IPv4 address", clientAddress(headers({ "x-forwarded-for": "::ffff:203.0.113.7" })), "203.0.113.7");
    check("something that is no address is kept as it is", clientAddress(headers({ "x-forwarded-for": "not-an-ip" })), "not-an-ip");
  }

  console.log("The refusal line");
  {
    check("it names the inbox", SUBMISSION_LIMIT_ERROR.includes("info@tennisbootcamp.ca"));
    check("it says no number", /\d/.test(SUBMISSION_LIMIT_ERROR.replace("info@tennisbootcamp.ca", "")), false);
    check("it never says which key tripped (no address, no IP, no 'your email')", /\b(IP|address)\b|\b(your|this) email\b/i.test(SUBMISSION_LIMIT_ERROR), false);
    check("no exclamation mark", SUBMISSION_LIMIT_ERROR.includes("!"), false);
  }

  console.log("isMissingTable — before migration 0011 runs");
  {
    check("PostgREST's missing-table code", isMissingTable({ code: "PGRST205", message: "Could not find the table" }));
    check("Postgres's undefined-table code", isMissingTable({ code: "42P01", message: "relation does not exist" }));
    check("any other error is not that", isMissingTable({ code: "57014", message: "timeout" }), false);
    check("no error is not that", isMissingTable(null), false);
    const t = { now: START };
    const missing: LimitStore = {
      async insert() {
        return "missing";
      },
      async readWindow() {
        throw new Error("never read when the table is missing");
      },
      async remove() {},
    };
    check("takeTicket says so, without reading", await takeTicket(missing, { secret: SECRET, scope: "intake", address: "203.0.113.7", email: "a@example.com", now: t.now }), "missing");
  }

  // ─── 4. The migration ───────────────────────────────────────────────────────

  console.log("Migration 0011 — one additive table, server only");
  {
    const path = "supabase/migrations/0011_submission_limits.sql";
    check("the migration exists", existsSync(join(ROOT, path)));
    const sqlRaw = read(path);
    const verifyAt = sqlRaw.indexOf("-- verify:");
    check("it carries a -- verify: block", verifyAt > 0);
    const body = sqlRaw
      .slice(0, verifyAt)
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .toLowerCase();
    check("create table if not exists", body.includes("create table if not exists public.submission_limits ("));
    check("the columns are an id, the form, the keyed hash and the time — no address or email", /create table if not exists public\.submission_limits \( id uuid primary key default gen_random_uuid\(\), scope text not null, key_hash text not null, created_at timestamptz not null default now\(\) \);/.test(body));
    check("guarded do $$ blocks for its two checks and its one rule", (body.match(/do \$\$ begin if not exists \(/g) ?? []).length, 3);
    check("the hash is 64 hex characters, checked by the table", body.includes("check (key_hash ~ '^[0-9a-f]{64}$')"));
    check("row level security is on", body.includes("alter table public.submission_limits enable row level security;"));
    check("one rule, so the Security Advisor never lists the table as having none", (body.match(/create policy/g) ?? []).length, 1);
    check(
      "…created in a guarded do $$ block, by its name",
      body.includes("do $$ begin if not exists ( select 1 from pg_policies where schemaname = 'public' and tablename = 'submission_limits' and policyname = 'submission_limits_no_client_access' ) then create policy submission_limits_no_client_access on public.submission_limits")
    );
    check("…an explicit deny: visitors and accounts, every command, no row", body.includes("for all to anon, authenticated using (false) with check (false);"));
    check("…and nothing in the file lets a row through", /using \(true\)|with check \(true\)|to public\b|to service_role using/.test(body), false);
    const verify = sqlRaw.slice(verifyAt);
    check("the verify block expects the one rule and reads it back", verify.includes("policies 1") && verify.includes("deny_rule true") && verify.includes("as deny_rule"));
    check("visitors and accounts get nothing", body.includes("revoke all on table public.submission_limits from public, anon, authenticated;"));
    check("the server reads, writes and deletes", body.includes("grant select, insert, delete on table public.submission_limits to service_role;"));
    check("indexed for the window reads and the clean-up", body.includes("create index if not exists submission_limits_key_idx") && body.includes("create index if not exists submission_limits_created_idx"));
    check("nothing else is touched (no other table altered)", (body.match(/alter table public\.(\w+)/g) ?? []).every((m) => m.endsWith("submission_limits")));
    check("no drop, no update, no delete in the migration itself", /\b(drop table|drop column|update public|delete from)\b/.test(body), false);
  }

  // ─── 5. The wiring ──────────────────────────────────────────────────────────

  const ROUTES: [string, LimitScope][] = [
    ["src/app/api/intake/route.ts", "intake"],
    ["src/app/api/assessment/book/route.ts", "book"],
    ["src/app/api/enroll/route.ts", "enroll"],
    ["src/app/api/checkout/route.ts", "checkout"],
    ["src/app/api/enroll/etransfer/route.ts", "etransfer"],
    ["src/app/api/newsletter/route.ts", "newsletter"],
    ["src/app/api/program-interest/route.ts", "interest"],
  ];

  console.log("Source — every public form route checks its limits before the work");
  for (const [file, scope] of ROUTES) {
    const src = read(file);
    const at = src.indexOf(`checkSubmissionLimit(req, "${scope}",`);
    check(`${file}: checks the "${scope}" limits`, at !== -1);
    check(`${file}: answers a refusal with the plain line and a 429`, src.includes("{ error: SUBMISSION_LIMIT_ERROR }, { status: 429 }"));
    const work = ["values.append(", "saveEnrollmentToSupabase(", "createCheckoutSession(", "recordEtransferIntent(", "createPendingBooking(", "createRequestedBooking(", "subscribeToMailerLite("]
      .map((w) => src.indexOf(w))
      .filter((i) => i !== -1);
    check(`${file}: …before anything is written or sent`, work.every((w) => at < w));
  }
  {
    const reset = read("src/app/api/auth/reset-password/route.ts");
    check("reset-password keeps its own cooldown (no second limit)", reset.includes("checkSubmissionLimit("), false);
  }

  console.log("Source — a try counts only after its fields, the gate and a free slot");
  {
    const book = read("src/app/api/assessment/book/route.ts");
    const firstBook = book.indexOf('checkSubmissionLimit(req, "book",');
    const lastBook = book.lastIndexOf('checkSubmissionLimit(req, "book",');
    check("booking: a request is counted after its own field check", book.indexOf('"Please provide your name and a valid email."') < firstBook);
    check("booking: a slot booking is counted after its field check", book.indexOf('"Please provide your name, a valid email, and pick a slot."') < lastBook && firstBook !== lastBook);
    check("booking: …and after the card-unavailable refusal", book.indexOf("ASSESSMENT_PAYMENT_UNAVAILABLE }") < lastBook);
    check("booking: a slot just taken takes the try back before its 409", /if \(err instanceof SlotTakenError\) \{\s*await ticket\.release\(\);/.test(book));

    const enroll = read("src/app/api/enroll/route.ts");
    check("enroll: counted after the gate", enroll.indexOf("gateRefusal(gate)") < enroll.indexOf("checkSubmissionLimit("));

    for (const file of ["src/app/api/checkout/route.ts", "src/app/api/enroll/etransfer/route.ts"]) {
      const src = read(file);
      const at = src.indexOf("checkSubmissionLimit(");
      check(`${file}: counted after the invite gate`, src.indexOf("gateRefusal(gate)") < at);
      check(`${file}: …the by-approval wall`, src.indexOf("approvalRefusal(cohort, gate)") < at);
      check(`${file}: …and the contact-email check`, src.indexOf("contactEmailRefusal(signedIn") < at);
      check(`${file}: a full cohort takes the try back`, /seatsRefuse\(seatsRemaining, players\.length\)\) \{\s*await ticket\.release\(\);/.test(src));
      check(`${file}: records it cannot read take the try back`, /if \(sheet\.status === "error"\) \{\s*await ticket\.release\(\);/.test(src));
    }
    const checkout = read("src/app/api/checkout/route.ts");
    check("checkout: rows that are not the payer's own take the try back", /if \(notOwn\.length > 0\) \{\s*await ticket\.release\(\);/.test(checkout));
    check("checkout: a declined invite takes the try back", /decision\.kind === "refuse"\) \{\s*await ticket\.release\(\);/.test(checkout));
    const etransfer = read("src/app/api/enroll/etransfer/route.ts");
    check("e-transfer: a first player refused before anything is recorded takes the try back", /if \(!result\.ok\) \{\s*if \(i === 0\) await ticket\.release\(\);/.test(etransfer));

    for (const [file, guard] of [
      ["src/app/api/intake/route.ts", 'decision.action === "reject"'],
      ["src/app/api/newsletter/route.ts", "!isValidEmail(body.email)"],
      ["src/app/api/program-interest/route.ts", "!isValidEmail(body.email)"],
    ] as const) {
      const src = read(file);
      check(`${file}: counted after its field check`, src.indexOf(guard) < src.indexOf("checkSubmissionLimit("));
    }
  }

  console.log("Source — the store: keyed hashes, a day's rows, one warning");
  {
    const db = read("src/lib/submissionLimitsDb.ts");
    check("server only", db.startsWith('import "server-only";'));
    check("the key is a secret the server already has", db.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"));
    check("the count is takeTicket's (insert, count, take back)", db.includes("takeTicket(store, {"));
    check("the table gets exactly the rows takeTicket hands it", db.includes('.from("submission_limits").insert(rows)'));
    check("rows older than a day are deleted", db.includes('.lt("created_at",'));
    check("before the migration: works as before, one warning", db.includes("let warnedMissing = false") && db.includes("if (!warnedMissing)"));
    check("a store it cannot read never blocks a form", db.includes("return OPEN_TICKET"));
  }

  console.log("Source — the bot check on checkout, enroll and e-transfer, fed by the wizard");
  {
    for (const file of ["src/app/api/checkout/route.ts", "src/app/api/enroll/route.ts", "src/app/api/enroll/etransfer/route.ts"]) {
      const src = read(file);
      const at = src.indexOf("checkBot(body)");
      check(`${file}: runs checkBot`, at !== -1);
      // Since the safety round these three answer a tripped check with a
      // plain refusal, never a success-shaped body (test-safety-round.ts).
      check(`${file}: a tripped check is logged without the body and refused plainly`, src.includes("logBotDrop(") && src.includes("{ error: BOT_REFUSAL_ERROR }, { status: 400 }"));
      check(`${file}: …before its limits and its work`, at < src.indexOf("checkSubmissionLimit("));
    }
    const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
    check("the wizard holds the honeypot field", wizard.includes("const bot = useBotCheck();") && wizard.includes("{bot.field}"));
    check("it sends the bot fields to all three routes", (wizard.match(/\.\.\.bot\.payload\(\)/g) ?? []).length, 3);
    check("it shows a 429's plain line", wizard.includes("res.status !== 429"));
  }

  console.log("A refused try shows the route's own line, never 'Something went wrong' (review fix 8)");
  {
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    check("a 429 shows the route's line", await refusedLine(json(429, { error: "The route's own line." })), "The route's own line.");
    check("a 429 with no readable line shows the plain line", await refusedLine(new Response("not json", { status: 429 })), SUBMISSION_LIMIT_ERROR);
    check("a 429 with an empty line shows the plain line", await refusedLine(json(429, { error: "  " })), SUBMISSION_LIMIT_ERROR);
    check("any other failure is not a refusal", await refusedLine(json(500, { error: "x" })), null);
    check("…nor a 400", await refusedLine(json(400, { error: "x" })), null);
    const refused = await submitFailure(json(429, { error: SUBMISSION_LIMIT_ERROR }));
    check("a refused submit throws a FormRefusal carrying the line", refused instanceof FormRefusal && refused.message === SUBMISSION_LIMIT_ERROR);
    const failed = await submitFailure(json(500, {}));
    check("any other failure throws a plain error, so the form keeps its own line", failed instanceof Error && !(failed instanceof FormRefusal));
    check("the plain line is written once, in the client-safe module", read("src/lib/submissionLimits.ts").includes('"Too many tries'), false);
    check("the client-safe module imports nothing from the server", /from "node:|import "server-only"|@\/lib\/supabase/.test(read("src/lib/formRefusal.ts")), false);

    const quiz = read("src/app/intake/page.tsx");
    check("quiz: a failed submit throws through submitFailure", quiz.includes("if (!res.ok) throw await submitFailure(res);"));
    check("quiz: a refusal keeps the route's line", quiz.includes("setSubmitError(err instanceof FormRefusal ? err.message : true);"));
    check("quiz: the line shows in place of 'Something went wrong'", quiz.includes('{typeof submitError === "string" && (') && quiz.includes("{submitError === true && ("));
    const newsletter = read("src/components/sections/EmailCapture.tsx");
    check("newsletter: a refusal shows the route's line", newsletter.includes("setRefusal(await refusedLine(res));") && newsletter.includes("{refusal ?? "));
    check("newsletter: a new try clears it", newsletter.includes("setRefusal(null);"));
    const interest = read("src/components/sections/ProgramInterestForm.tsx");
    check("program interest: a failed submit throws through submitFailure", interest.includes("if (!res.ok) throw await submitFailure(res);"));
    check("program interest: a refusal shows the route's line", interest.includes("err instanceof FormRefusal ? err.message :"));
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll submission-limit checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

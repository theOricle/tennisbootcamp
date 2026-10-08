// Run from project root: npx tsx src/scripts/test-admin-users.ts
// Pins the paged auth-user lookup (src/lib/supabase/adminUsers.ts, backlog
// #37): findAuthUserByEmail pages listUsers until it finds the address or the
// list runs out, listAllAuthUsers collects every page, both stop on a short
// page, on an error, and at the page cap, and both log without PII. Also pins
// that findUserIdByEmail, listAccounts and the reset-password route go
// through the helper rather than a one-page listUsers call. Exits non-zero on
// any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_USERS_MAX_PAGES,
  ADMIN_USERS_PER_PAGE,
  findAuthUserByEmail,
  listAllAuthUsers,
  normalizeEmail,
  type AdminUser,
  type AdminUsersClient,
} from "../lib/supabase/adminUsers";

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

// ─── Fake admin client ────────────────────────────────────────────────────────

type FakeUser = AdminUser & { recovery_sent_at?: string | null };

type FakeOptions = {
  /** Throw (not reject with an error object) on this page. */
  throwOnPage?: number;
  /** Resolve with an error object on this page. */
  errorOnPage?: number;
  /** Ignore the short-page rule and keep serving full pages forever. */
  endless?: boolean;
  /** The `total` (x-total-count) to report; omitted = header absent. */
  total?: number;
};

function makeUsers(count: number, prefix = "user"): FakeUser[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    email: `${prefix}${i + 1}@example.com`,
  }));
}

/** A listUsers that serves `all` in pages of `perPage`, recording each call. */
function fakeClient(all: FakeUser[], opts: FakeOptions = {}) {
  const calls: { page: number; perPage: number }[] = [];
  const client: AdminUsersClient<FakeUser> = {
    auth: {
      admin: {
        async listUsers(params) {
          const page = params?.page ?? 1;
          const perPage = params?.perPage ?? 50;
          calls.push({ page, perPage });
          if (opts.throwOnPage === page) throw new Error("network down");
          if (opts.errorOnPage === page) {
            return { data: { users: [] }, error: { status: 500 } };
          }
          if (opts.endless) {
            return { data: { users: makeUsers(perPage, `p${page}`) }, error: null };
          }
          const start = (page - 1) * perPage;
          const data: { users: FakeUser[]; total?: number } = { users: all.slice(start, start + perPage) };
          if (opts.total !== undefined) data.total = opts.total;
          return { data, error: null };
        },
      },
    },
  };
  return { client, calls };
}

/** Captures console output so the PII rule can be checked. */
function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.log = grab;
  console.warn = grab;
  console.error = grab;
  return fn()
    .then((result) => ({ result, lines }))
    .finally(() => {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
    });
}

async function main() {
  console.log("adminUsers: constants and email rule");
  check("page size is GoTrue's 1000 maximum", ADMIN_USERS_PER_PAGE, 1000);
  check("page cap is a hard number above anything this project will see", ADMIN_USERS_MAX_PAGES > 1, true);
  check("normalizeEmail trims and lowercases", normalizeEmail("  Player@Example.COM \n"), "player@example.com");

  console.log("\nfindAuthUserByEmail");
  {
    // 2,350 users → pages of 1000, 1000, 350. Target sits on page 3.
    const all = makeUsers(2350);
    const { client, calls } = fakeClient(all);
    const found = await findAuthUserByEmail(client, "USER2222@Example.com ");
    check("found on page 3 (past the old 200-user ceiling)", found?.id, "user-2222");
    check("asked for pages 1, 2 and 3 at perPage 1000", calls, [
      { page: 1, perPage: 1000 },
      { page: 2, perPage: 1000 },
      { page: 3, perPage: 1000 },
    ]);
  }
  {
    const all = makeUsers(2350);
    const { client, calls } = fakeClient(all);
    const found = await findAuthUserByEmail(client, "user7@example.com");
    check("found on page 1 → stops after one call", found?.id, "user-7");
    check("no extra pages read once found", calls.length, 1);
  }
  {
    const all = makeUsers(150);
    const { client, calls } = fakeClient(all);
    const found = await findAuthUserByEmail(client, "user120@example.com");
    check("≤200 users: found on the one short page", found?.id, "user-120");
    check("≤200 users: exactly one call, as before", calls.length, 1);
  }
  {
    const all = makeUsers(2350);
    const { client, calls } = fakeClient(all);
    const found = await findAuthUserByEmail(client, "nobody@example.com");
    check("not found → null", found, null);
    check("stopped on the short third page (no page 4)", calls.map((c) => c.page), [1, 2, 3]);
  }
  {
    const all = makeUsers(2000); // exactly two full pages
    const { client, calls } = fakeClient(all);
    const found = await findAuthUserByEmail(client, "nobody@example.com");
    check("exactly-full last page: one empty page confirms the end, then null", found, null);
    check("pages read: 1, 2, then the empty 3", calls.map((c) => c.page), [1, 2, 3]);
  }
  {
    const all = makeUsers(10);
    all[3] = { id: "no-email", email: null };
    all[4] = { id: "spaced", email: "  Mixed@Case.com " };
    const { client } = fakeClient(all);
    check("blank target with a null-email user present → null", await findAuthUserByEmail(client, ""), null);
    check("blank target → null without matching anything", await findAuthUserByEmail(client, "   "), null);
    check("stored email is trimmed and lowercased too", (await findAuthUserByEmail(client, "mixed@case.com"))?.id, "spaced");
  }
  {
    const { client, calls } = fakeClient(makeUsers(2350), { errorOnPage: 2 });
    const { result, lines } = await captureConsole(() => findAuthUserByEmail(client, "user2222@example.com"));
    check("error object on page 2 → null (fail-safe, no throw)", result, null);
    check("no page read after the error", calls.map((c) => c.page), [1, 2]);
    check("the failure is logged", lines.length, 1);
    check("the log carries the page and status, not the address", /page 2.*status 500/.test(lines[0]) && !/example\.com/.test(lines[0]), true);
  }
  {
    // A *thrown* listUsers propagates, as the one-page call did on main —
    // provisionIntakeAccount's outer catch turns it into account:"skipped".
    const { client, calls } = fakeClient(makeUsers(2350), { throwOnPage: 2 });
    const { result, lines } = await captureConsole(() =>
      findAuthUserByEmail(client, "user2222@example.com").then(
        () => "resolved",
        (err: unknown) => (err instanceof Error ? err.message : "rejected")
      )
    );
    check("a thrown listUsers propagates to the caller (main's behaviour)", result, "network down");
    check("no page read after the throw", calls.map((c) => c.page), [1, 2]);
    check("the helper logs nothing for a throw (the caller owns that)", lines, []);
  }
  {
    // Backstop for the short-page stop: the server's total says more exist.
    const { client, calls } = fakeClient(makeUsers(1300), { total: 1300 });
    const { result, lines } = await captureConsole(() => findAuthUserByEmail(client, "nobody@example.com"));
    check("short page matching the server total → null, no warning", [result, lines.length], [null, 0]);
    check("two pages read", calls.map((c) => c.page), [1, 2]);
  }
  {
    // 300 users served but the server says 1300: the short page lied.
    const { client } = fakeClient(makeUsers(300), { total: 1300 });
    const { result, lines } = await captureConsole(() => findAuthUserByEmail(client, "nobody@example.com"));
    check("short page below the server total → still null", result, null);
    check("the gap is warned about with counts only, no address", lines.length === 1 && /300.*1300/.test(lines[0]) && !/example\.com/.test(lines[0]), true);
  }
  {
    const { client, calls } = fakeClient([], { endless: true });
    const { result, lines } = await captureConsole(() => findAuthUserByEmail(client, "never@example.com"));
    check("an endless list stops at the page cap → null", result, null);
    check("exactly ADMIN_USERS_MAX_PAGES pages were read", calls.length, ADMIN_USERS_MAX_PAGES);
    check("the cap is warned about without the address", lines.length === 1 && /page cap/.test(lines[0]) && !/example\.com/.test(lines[0]), true);
  }

  console.log("\nlistAllAuthUsers");
  {
    const all = makeUsers(2350);
    const { client, calls } = fakeClient(all);
    const r = await listAllAuthUsers(client);
    check("every user across three pages", r.users.length, 2350);
    check("in page order", [r.users[0].id, r.users[999].id, r.users[1000].id, r.users[2349].id], ["user-1", "user-1000", "user-1001", "user-2350"]);
    check("complete", r.complete, true);
    check("stopped on the short page", calls.map((c) => c.page), [1, 2, 3]);
  }
  {
    const { client, calls } = fakeClient(makeUsers(42));
    const r = await listAllAuthUsers(client);
    check("≤200 users: one call, all returned", [calls.length, r.users.length, r.complete], [1, 42, true]);
  }
  {
    const { client } = fakeClient([]);
    const r = await listAllAuthUsers(client);
    check("empty project → empty, complete", r, { users: [], complete: true });
  }
  {
    const { client } = fakeClient(makeUsers(2350), { errorOnPage: 3 });
    const { result: r } = await captureConsole(() => listAllAuthUsers(client));
    check("error on page 3 → the 2000 already read, flagged incomplete", [r.users.length, r.complete], [2000, false]);
  }
  {
    const { client } = fakeClient(makeUsers(2350), { throwOnPage: 1 });
    const outcome = await listAllAuthUsers(client).then(
      () => "resolved",
      (err: unknown) => (err instanceof Error ? err.message : "rejected")
    );
    check("throw on page 1 propagates (listAccounts catches it to [])", outcome, "network down");
  }
  {
    const { client } = fakeClient(makeUsers(2350), { total: 2350 });
    const { result: r, lines } = await captureConsole(() => listAllAuthUsers(client));
    check("short page matching the server total → complete, no warning", [r.users.length, r.complete, lines.length], [2350, true, 0]);
  }
  {
    const { client } = fakeClient(makeUsers(300), { total: 1300 });
    const { result: r, lines } = await captureConsole(() => listAllAuthUsers(client));
    check("short page below the server total → what was read, flagged incomplete", [r.users.length, r.complete], [300, false]);
    check("the backstop warning carries counts only", lines.length === 1 && /300.*1300/.test(lines[0]) && !/example\.com/.test(lines[0]), true);
  }
  {
    const { client, calls } = fakeClient([], { endless: true });
    const { result: r } = await captureConsole(() => listAllAuthUsers(client));
    check("endless list → capped, incomplete", [calls.length, r.users.length, r.complete], [ADMIN_USERS_MAX_PAGES, ADMIN_USERS_MAX_PAGES * ADMIN_USERS_PER_PAGE, false]);
  }

  console.log("\ncall sites go through the helper");
  const root = join(__dirname, "..", "..");
  const playersSrc = readFileSync(join(root, "src", "lib", "players.ts"), "utf8");
  const routeSrc = readFileSync(join(root, "src", "app", "api", "auth", "reset-password", "route.ts"), "utf8");
  const helperSrc = readFileSync(join(root, "src", "lib", "supabase", "adminUsers.ts"), "utf8");
  check("players.ts no longer calls listUsers directly", /listUsers\(/.test(playersSrc), false);
  check("players.ts no longer asks for one page of 200", /perPage:\s*200/.test(playersSrc), false);
  check("findUserIdByEmail uses findAuthUserByEmail", /findUserIdByEmail[\s\S]*?findAuthUserByEmail\(supabase, email\)/.test(playersSrc), true);
  check("listAccounts uses listAllAuthUsers", /listAccounts[\s\S]*?listAllAuthUsers\(supabase\)/.test(playersSrc), true);
  check("the reset-password route no longer calls listUsers directly", /listUsers\(/.test(routeSrc), false);
  check("the reset-password route looks up through the helper", /findAuthUserByEmail\(supabase, email\)/.test(routeSrc), true);
  check("the route's lookup still fails open (no early return on !user)", /if \(!user\)/.test(routeSrc), false);
  check("the route catches a thrown lookup (fail open inside after())", /findAuthUserByEmail\(supabase, email\)\.catch\(\(\) => null\)/.test(routeSrc), true);
  check("listAccounts warns (counts only) when the list is incomplete", /if \(!r\.complete\)[\s\S]*?console\.warn\([^;]*r\.users\.length/.test(playersSrc), true);
  check("listAccounts degrades a thrown list to [] with a warning", /\(\) => \{\s*console\.warn\([^;]*\);\s*return \[\];/.test(playersSrc), true);
  check("no listAccounts log line names a user or an email", /\[listAccounts\][^;]*(?:email|\.name|\.id)/.test(playersSrc), false);
  const intakeSrc = readFileSync(join(root, "src", "lib", "intakeAccount.ts"), "utf8");
  check(
    "intake's lookup sits inside provisionIntakeAccount's try, so a throw becomes account:\"skipped\"",
    (() => {
      const tryAt = intakeSrc.indexOf("try {");
      const lookup = intakeSrc.indexOf("await findUserIdByEmail(email)");
      const catchAt = intakeSrc.indexOf("} catch", lookup);
      return tryAt > 0 && lookup > tryAt && catchAt > lookup;
    })(),
    true
  );
  check("the helper's only listUsers calls page at ADMIN_USERS_PER_PAGE", (helperSrc.match(/listUsers\(/g) ?? []).length === 2 && /listUsers\(\{ page, perPage: ADMIN_USERS_PER_PAGE \}\)/.test(helperSrc), true);
  check("the helper is testable outside Next (no server-only import)", /import "server-only"/.test(helperSrc), false);
  check(
    "no helper log line interpolates an email",
    /console\.(?:log|warn|error)\([^;]*(?:email|target)/.test(helperSrc),
    false
  );

  console.log(failures === 0 ? "\nAll admin-users checks passed." : `\n${failures} admin-users check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Run from project root: npx tsx src/scripts/test-own-row-writes.ts
//
// Pins backlog #68 (migration 0010): what a signed-in account may write to
// `profiles`, `participants` and `assessment_bookings` through the database's
// public interface, and that the code in src/ stays inside those limits.
//
//   1. The migration. Its statements are read from the file: one profiles
//      column (full_name) is updatable by a signed-in account, nothing is
//      writable by a visitor who is not signed in, the two other tables take
//      no own-row write, and the server keeps full access. The verify block
//      carries the privilege and policy report and the refusal test, always
//      rolled back, printing nothing about a person.
//   2. The code. Every write to the three tables in src/ is listed with the
//      client that makes it. A write made with the browser client or the
//      signed-in user's server client must be an update of the columns the
//      migration grants, written inline; everything else goes through the
//      service-role client, in a server-only module or a route handler.
//
// Pure: it reads files and nothing else. No network, no database, no env.
// Exits non-zero on any failure.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PROTECTED_TABLES = ["profiles", "participants", "assessment_bookings"];

// ─── SQL helpers ─────────────────────────────────────────────────────────────

/** One line of SQL without its `--` comment (a `--` inside quotes is kept). */
function stripLineComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") quoted = !quoted;
    else if (!quoted && line[i] === "-" && line[i + 1] === "-") return line.slice(0, i);
  }
  return line;
}

/** SQL with comments removed, lower-cased, and whitespace collapsed. */
function normalizeSql(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map(stripLineComment)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function migrationFiles(): string[] {
  return readdirSync(join(ROOT, "supabase", "migrations"))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
}

// ─── 1. The migration ────────────────────────────────────────────────────────

const MIGRATION = "0010_limit_own_row_writes.sql";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION}`;
const VERIFY_MARK = "-- verify:";

console.log("Migration 0010: the file");
check("the migration exists", existsSync(join(ROOT, MIGRATION_PATH)));
const sqlRaw = read(MIGRATION_PATH);
const verifyAt = sqlRaw.indexOf(VERIFY_MARK);
check("it carries a -- verify: block", verifyAt > 0);
const body = normalizeSql(sqlRaw.slice(0, verifyAt));
const verify = normalizeSql(sqlRaw.slice(verifyAt + VERIFY_MARK.length));
const statements = body
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const REVOKE_PROFILES =
  "revoke insert, update, delete on table public.profiles from public, anon, authenticated";
const GRANT_SERVER =
  "grant select, insert, update, delete on table public.profiles, public.participants, public.assessment_bookings to service_role";
const DROPPED_POLICIES: [policy: string, table: string][] = [
  ["participants_insert_own", "participants"],
  ["participants_update_own", "participants"],
  ["assessment_bookings_update_own", "assessment_bookings"],
];

/** The profiles columns the migration lets a signed-in account update. */
const accountGrant = statements.filter((s) => /^grant\b.*\bto authenticated$/.test(s));
const grantedColumns = (
  accountGrant[0]?.match(/^grant update \(([^)]*)\) on table public\.profiles to authenticated$/)?.[1] ?? ""
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

console.log("Migration 0010: profiles");
{
  check("table-wide insert, update and delete are withdrawn from public, anon and authenticated", statements.includes(REVOKE_PROFILES));
  check("a signed-in account is granted exactly one thing", accountGrant.length, 1);
  check("…an update of full_name on profiles, and no other column", grantedColumns, ["full_name"]);
  check(
    "the table-wide privilege is withdrawn before the column is granted",
    statements.indexOf(REVOKE_PROFILES) >= 0 && statements.indexOf(REVOKE_PROFILES) < statements.indexOf(accountGrant[0] ?? ""),
  );
  check("a visitor who is not signed in is granted nothing", statements.some((s) => /^grant\b.*\bto\b.*\b(anon|public)\b/.test(s)), false);
  check("the row policy on profiles is kept", body.includes("profiles_update_own"), false);

  // Every profiles column on file, from the migrations that created them.
  const earlier = migrationFiles()
    .filter((name) => name < MIGRATION)
    .map((name) => normalizeSql(read(`supabase/migrations/${name}`)));
  const created = earlier.join(" ").match(/create table if not exists profiles \(([^;]*)\);/)?.[1] ?? "";
  const columns = new Set(
    created
      .split(",")
      .map((def) => def.trim().split(" ")[0])
      .filter(Boolean),
  );
  for (const sql of earlier) {
    for (const m of sql.matchAll(/alter table public\.profiles add column if not exists (\w+)/g)) columns.add(m[1]);
  }
  const serverOnly = [...columns].filter((c) => !grantedColumns.includes(c)).sort();
  for (const column of [
    "role",
    "level",
    "level_assessed_at",
    "level_notes",
    "availability",
    "availability_updated_at",
    "availability_source",
    "availability_note",
    "phone",
  ]) {
    check(`profiles.${column} is written by the server only`, serverOnly.includes(column));
  }
  check("full_name is a profiles column", columns.has("full_name"));
}

console.log("Migration 0010: participants and assessment_bookings");
{
  for (const [policy, table] of DROPPED_POLICIES) {
    check(`${policy} is removed, if it exists`, statements.includes(`drop policy if exists "${policy}" on public.${table}`));
  }
  check("nothing else is dropped", statements.filter((s) => s.startsWith("drop ")).length, DROPPED_POLICIES.length);
  check("the read and admin policies are left alone", /_select_own|_admin_all/.test(body), false);
  check("no policy is created", body.includes("create policy"), false);
  check("row security is never switched off", /disable row level security|no force row level security/.test(body), false);
}

console.log("Migration 0010: the server, and the shape of the file");
{
  check("the service role keeps select, insert, update and delete on the three tables", statements.includes(GRANT_SERVER));
  check(
    "the file is these statements and no others",
    statements,
    [
      REVOKE_PROFILES,
      "grant update (full_name) on table public.profiles to authenticated",
      ...DROPPED_POLICIES.map(([policy, table]) => `drop policy if exists "${policy}" on public.${table}`),
      GRANT_SERVER,
    ],
  );
  check("no table, column or row is touched", /\b(create table|alter table|insert into|update |delete from|truncate)\b/.test(body), false);
  check("no explicit transaction control (the file runs as one unit)", statements.some((s) => /^(begin|commit|rollback)\b/.test(s)), false);
}

console.log("Migration 0010: the verify block");
{
  const ATTEMPTS = [
    "update public.profiles set role = role where id = v_account",
    "update public.profiles set level = level where id = v_account",
    "update public.participants set level = level where account_id = v_account",
    "insert into public.participants (account_id, full_name, relationship, level)",
    "update public.assessment_bookings set status = status, paid = paid, credit_status = credit_status where user_id = v_account",
  ];
  const NOTICES = [
    "raise notice 'refused: own role'",
    "raise notice 'refused: own level and own player''s level'",
    "raise notice 'refused: own booking''s status, paid flag and credit'",
  ];
  const UNDO = "raise exception using errcode = 'tb010'";
  const UNDO_HANDLER = "exception when sqlstate 'tb010' then null; end;";

  check("the refusal test is a do block", verify.includes("do $$"));
  check("it picks an account without the admin role", verify.includes("where p.role is distinct from 'admin'"));
  check("it acts through the signed-in role", verify.includes("set local role authenticated"));
  check("…as that account", verify.includes("set_config('request.jwt.claim.sub', v_account::text, true)") && verify.includes("json_build_object('sub', v_account, 'role', 'authenticated')"));
  check("it confirms the account can read its own rows first", (verify.match(/test setup failed, the account cannot read its own (profile|player|booking)/g) ?? []).length, 3);
  for (const attempt of ATTEMPTS) check(`attempt: ${attempt}`, verify.includes(attempt));
  check("every attempt writes a column back onto itself", ATTEMPTS.filter((a) => a.startsWith("update")).every((a) => [...a.matchAll(/(\w+) = (\w+)(?=,| where)/g)].every((m) => m[1] === m[2])));
  check("an attempt that goes through stops the run", (verify.match(/raise exception 'verify 0010 failed: [^']* was not refused'/g) ?? []).length, ATTEMPTS.length);
  check("a refusal is a privilege or row-rule refusal, nothing broader", (verify.match(/exception when insufficient_privilege then null; end;/g) ?? []).length, ATTEMPTS.length);
  check("no handler swallows other errors", verify.includes("when others"), false);
  check("three refusals are reported", (verify.match(/raise notice 'refused: /g) ?? []).length, 3);
  for (const notice of NOTICES) check(notice, verify.includes(notice));

  // Always rolled back: the undo follows the last refusal unconditionally and
  // is the only thing its handler catches.
  const lastNotice = verify.indexOf(NOTICES[2]);
  const undo = verify.indexOf(UNDO);
  check("the test's sub-transaction ends in an undo", undo > lastNotice && lastNotice > 0);
  check("…raised once", verify.split(UNDO).length - 1, 1);
  check("…unconditionally", /\b(if|case|loop|return)\b/.test(verify.slice(lastNotice + NOTICES[2].length, undo)), false);
  check("…and caught straight away, by its own code only", verify.indexOf(UNDO_HANDLER) > undo && verify.indexOf(UNDO_HANDLER) - undo < 120);
  const subTransaction = verify.slice(0, undo);
  for (const step of [...ATTEMPTS, "set local role authenticated", "insert into public.participants (account_id, full_name, relationship) values", "insert into public.assessment_bookings (name, email, user_id, status) values"]) {
    check(`inside the undone part: ${step.slice(0, 60)}`, subTransaction.includes(step));
  }
  check("no commit or savepoint release inside the block", /\b(commit|release savepoint)\b/.test(verify), false);

  // Nothing about a person: placeholder rows only, no value is ever
  // interpolated into a message, and no personal column is read.
  check("the placeholder player and booking carry placeholder values", verify.includes("values (v_account, 'verify-0010', 'other')") && verify.includes("values ('verify-0010', 'verify-0010@example.invalid', v_account, 'requested')"));
  check("no message interpolates a value", /raise (notice|exception)[^;]*%/.test(verify), false);
  const reads = verify
    .replace(/insert into public\.\w+ \([^)]*\) values \([^)]*\)/g, "")
    .replace(/'(?:[^']|'')*'/g, "''");
  check("no personal column is read", /\b(email|phone|full_name|name|notes?|availability)\b/.test(reads.replace(/::name\b/g, "")), false);
  check("auth.users is never read", verify.includes("auth.users"), false);

  // The report: expected beside actual, as the last statement.
  for (const expected of [
    "'full_name'::text",
    "'profiles_select_own (select), profiles_update_own (update)'",
    "'participants_admin_all (all), participants_select_own (select)'",
    "'assessment_bookings_admin_all (all), assessment_bookings_select_own (select)'",
    "'9 of 9'",
    "'3 of 3'",
  ]) {
    check(`the report expects ${expected}`, verify.includes(expected));
  }
  check("the report lists the three refusals", (verify.match(/'refusal test: (?:[^']|'')*', 'refused'/g) ?? []).length, 3);
  check("the report reads the privileges and the policies", verify.includes("has_column_privilege('authenticated'::name") && verify.includes("has_any_column_privilege('anon'::name") && verify.includes("from pg_policies pol"));
  check("the report is the last statement", verify.endsWith("as c (ord, check_name, expected, actual) order by c.ord;"));
  check("…with twelve rows", (verify.match(/\( \d+, '/g) ?? []).length, 12);
}

console.log("Later migrations");
{
  // A later file that grants on, or adds a policy to, one of the three tables
  // changes what this test pins: update the test with it, deliberately.
  const later = migrationFiles().filter((name) => name > MIGRATION);
  const tables = PROTECTED_TABLES.join("|");
  const reopening = later.filter((name) => {
    const sql = normalizeSql(read(`supabase/migrations/${name}`));
    return (
      new RegExp(`create policy [^;]* on (public\\.)?(${tables})\\b`).test(sql) ||
      new RegExp(`grant [^;]* on [^;]*\\b(${tables})\\b[^;]* to [^;]*\\b(anon|authenticated|public)\\b`).test(sql)
    );
  });
  check("no later migration grants on or adds a policy to the three tables", reopening, []);
}

// ─── 2. The code ─────────────────────────────────────────────────────────────

type ClientKind = "service" | "browser" | "session" | "unknown";
type Chain = {
  line: number;
  /** The table name, or "?" when it is not known from the source. */
  table: string;
  /** The method that follows `.from(…)`, or "" when there is none. */
  method: string;
  client: ClientKind;
  /** Keys of an inline object payload; null when the payload is anything else. */
  columns: string[] | null;
};

const WRITE_METHODS = ["insert", "update", "upsert", "delete"];
const SERVICE_MODULE = "@/lib/supabase/service";
const BROWSER_MODULE = "@/lib/supabase/browser";
const SESSION_MODULE = "@/lib/supabase/server";

/** Table constants a `.from()` may name instead of a string (src/lib/players.ts). */
const TABLE_CONSTANTS = new Map<string, string>();
for (const m of read("src/lib/players.ts").matchAll(/export const (\w+) = "(\w+)";/g)) {
  if (PROTECTED_TABLES.includes(m[2])) TABLE_CONSTANTS.set(m[1], m[2]);
}

function tableOf(expression: string): string {
  const literal = expression.match(/^(["'`])([\w.]+)\1$/);
  if (literal) return literal[2].replace(/^public\./, "");
  return TABLE_CONSTANTS.get(expression) ?? "?";
}

/**
 * Which client a `.from()` is called on, read from the nearest declaration of
 * the receiver above the call. A receiver that arrives as a parameter, or that
 * is built any other way, is "unknown": the caller chose it.
 */
function clientOf(source: string, at: number, receiver: string | null): ClientKind {
  if (!receiver) return "unknown";
  const before = source.slice(0, at);
  const id = receiver.replace(/\$/g, "\\$");
  let declaredAt = -1;
  let factory = "";
  for (const m of before.matchAll(new RegExp(`\\b(?:const|let|var)\\s+${id}\\s*(?::[^=;]+)?=\\s*(?:await\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(`, "g"))) {
    declaredAt = m.index ?? -1;
    factory = m[1];
  }
  let parameterAt = -1;
  for (const m of before.matchAll(new RegExp(`[(,{]\\s*${id}\\s*\\??\\s*:`, "g"))) parameterAt = m.index ?? -1;
  if (declaredAt < 0 || parameterAt > declaredAt) return "unknown";
  const imports = (module: string) => source.includes(`"${module}"`) || source.includes(`'${module}'`);
  if (factory === "createServiceClient") return imports(SERVICE_MODULE) ? "service" : "unknown";
  if (factory === "createClient") {
    if (imports(BROWSER_MODULE) && !imports(SESSION_MODULE)) return "browser";
    if (imports(SESSION_MODULE) && !imports(BROWSER_MODULE)) return "session";
  }
  return "unknown";
}

/** Keys of the object literal that opens at `open`, or null when they can't be read. */
function objectKeys(source: string, open: number): string[] | null {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  let closed = false;
  for (let i = open; i < source.length && !closed; i++) {
    const ch = source[i];
    if (quote) {
      current += ch;
      if (ch === "\\") current += source[++i] ?? "";
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
    } else if (ch === "{" || ch === "(" || ch === "[") {
      if (depth++ > 0) current += ch;
    } else if (ch === "}" || ch === ")" || ch === "]") {
      if (--depth === 0) closed = true;
      else current += ch;
    } else if (ch === "," && depth === 1) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (!closed) return null;
  parts.push(current);
  const keys: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue; // a trailing comma
    const key = part.split(":")[0].trim().replace(/^(["'])(.*)\1$/, "$2");
    // A spread, a computed key, a comment: not known from the source.
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) return null;
    keys.push(key);
  }
  return keys;
}

/** Every `.from(<one name>)` in a file, with what follows it. */
function chainsIn(source: string): Chain[] {
  const chains: Chain[] = [];
  for (const m of source.matchAll(/\.from\(\s*([^()\s,]+)\s*\)(?:\s*\.\s*([A-Za-z_$][\w$]*)\s*\()?/g)) {
    const at = m.index ?? 0;
    const receiver = source.slice(0, at).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] ?? null;
    const method = m[2] ?? "";
    const argument = source.slice(at + m[0].length).match(/^\s*(\S)/);
    const open = argument?.[1] === "{" ? at + m[0].length + argument[0].length - 1 : -1;
    chains.push({
      line: source.slice(0, at).split("\n").length,
      table: tableOf(m[1]),
      method,
      client: clientOf(source, at, receiver),
      columns: WRITE_METHODS.includes(method) && method !== "delete" && open >= 0 ? objectKeys(source, open) : null,
    });
  }
  return chains;
}

/**
 * Why a chain is outside the limits, or null when it is inside them.
 * `allowed` maps a table to the columns the migration lets an account update.
 */
function refusal(chain: Chain, allowed: Record<string, string[]>): string | null {
  const isWrite = WRITE_METHODS.includes(chain.method);
  if (chain.table === "?") {
    // A table held in a variable: only a write, and only off the service client, is our business.
    return isWrite && chain.client !== "service" ? "the table is not known from the source" : null;
  }
  if (!PROTECTED_TABLES.includes(chain.table)) return null;
  if (chain.client === "service") return null;
  if (!isWrite) return chain.method === "select" ? null : "not a plain read or write";
  if (chain.client === "unknown") return "the client is not known from the source";
  const columns = allowed[chain.table] ?? [];
  if (columns.length === 0) return `${chain.table} takes no ${chain.client} write`;
  if (chain.method !== "update") return `${chain.method} is not allowed, only update`;
  if (!chain.columns) return "the columns are not written inline";
  const outside = chain.columns.filter((c) => !columns.includes(c));
  return outside.length > 0 ? `outside the allowed columns: ${outside.join(", ")}` : null;
}

const ALLOWED: Record<string, string[]> = { profiles: grantedColumns };

console.log("The scanner, on samples");
{
  const browser = `import { createClient } from "${BROWSER_MODULE}";\nconst supabase = createClient();\n`;
  const session = `import { createClient } from "${SESSION_MODULE}";\nconst supabase = await createClient();\n`;
  const service = `import { createServiceClient } from "${SERVICE_MODULE}";\nconst supabase = createServiceClient();\n`;
  const verdict = (source: string) => chainsIn(source).map((c) => refusal(c, ALLOWED));

  check("browser: an inline update of full_name on profiles is inside the limits", verdict(`${browser}await supabase\n  .from("profiles")\n  .update({ full_name: name.trim() })\n  .eq("id", id);`), [null]);
  check("browser: a quoted key reads the same", verdict(`${browser}await supabase.from('profiles').update({ "full_name": name });`), [null]);
  check("browser: a second column is outside them", verdict(`${browser}await supabase.from("profiles").update({ full_name: name, phone });`), ["outside the allowed columns: phone"]);
  check("session: the same rule", verdict(`${session}await supabase.from("profiles").update({ phone: value });`), ["outside the allowed columns: phone"]);
  check("an upsert is not an update", verdict(`${session}await supabase.from("profiles").upsert({ full_name: name });`), ["upsert is not allowed, only update"]);
  check("an insert is not an update", verdict(`${browser}await supabase.from("profiles").insert({ full_name: name });`), ["insert is not allowed, only update"]);
  check("a delete is not an update", verdict(`${browser}await supabase.from("profiles").delete().eq("id", id);`), ["delete is not allowed, only update"]);
  check("a payload held in a variable can't be read", verdict(`${browser}await supabase.from("profiles").update(patch);`), ["the columns are not written inline"]);
  check("a spread payload can't be read", verdict(`${browser}await supabase.from("profiles").update({ ...patch, full_name: name });`), ["the columns are not written inline"]);
  check("participants takes no browser write", verdict(`${browser}await supabase.from("participants").update({ full_name: name });`), ["participants takes no browser write"]);
  check("participants takes no user-session write, by its constant either", verdict(`${session}await supabase.from(PARTICIPANT_TABLE).insert({ full_name: name });`), ["participants takes no session write"]);
  check("the profiles constant is followed too", verdict(`${session}await supabase.from(PLAYER_TABLE).update({ phone: value });`), ["outside the allowed columns: phone"]);
  check("assessment_bookings takes no user-session write", verdict(`${session}await supabase.from("assessment_bookings").update({ request_note: note });`), ["assessment_bookings takes no session write"]);
  check("a client passed in by the caller is not known", verdict(`${service}async function save(client: SupabaseClient) {\n  await client.from("participants").update({ full_name: name });\n}`), ["the client is not known from the source"]);
  check("a parameter that shadows a service client is not known", verdict(`${service}async function save(supabase: SupabaseClient) {\n  await supabase.from("participants").update({ full_name: name });\n}`), ["the client is not known from the source"]);
  check("a client built in place is not known", verdict(`${browser}await createClient().from("profiles").update({ full_name: name });`), ["the client is not known from the source"]);
  check("a file that loads both clients is not known", verdict(`import { createClient as other } from "${SESSION_MODULE}";\n${browser}await supabase.from("profiles").update({ full_name: name });`), ["the client is not known from the source"]);
  check("a write to a table held in a variable is not known", verdict(`${session}await supabase.from(table).update({ full_name: name });`), ["the table is not known from the source"]);
  check("a chain that is neither a read nor a write is not known", verdict(`${browser}const q = supabase.from("profiles");`), ["not a plain read or write"]);
  check("a read is always fine", verdict(`${browser}await supabase.from("profiles").select("role").eq("id", id);\nawait supabase.from(table).select("id");`), [null, null]);
  check("the service client may write any column", verdict(`${service}await supabase.from("participants").update(patch).eq("id", id);\nawait supabase.from("assessment_bookings").insert(row);\nawait supabase.from(PLAYER_TABLE).upsert({ id, ...patch });`), [null, null, null]);
  check("another table is not this test's business", verdict(`${browser}await supabase.from("enrollments").update({ status: value });`), [null]);
  check("Array.from and friends are not database calls", verdict(`${browser}const a = Array.from(new Set(ids));\nconst b = Array.from({ length: 3 }, (_, i) => i);\nconst c = Buffer.from(svg).toString("base64");`), [null]);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (rel === "src/scripts") continue; // tests and tools, never shipped
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}

console.log("src/: every write to the three tables");
{
  check("the table constants still name the tables", Object.fromEntries(TABLE_CONSTANTS), { PLAYER_TABLE: "profiles", PARTICIPANT_TABLE: "participants" });

  const files = sourceFiles("src");
  const outside: string[] = [];
  const writes: { file: string; chain: Chain }[] = [];
  const rawRest: string[] = [];
  for (const file of files) {
    const source = read(file);
    if (source.includes("/rest/v1")) rawRest.push(file);
    for (const chain of chainsIn(source)) {
      const why = refusal(chain, ALLOWED);
      if (why) outside.push(`${file}:${chain.line} ${chain.table}.${chain.method || "from"} (${chain.client}): ${why}`);
      if (PROTECTED_TABLES.includes(chain.table) && WRITE_METHODS.includes(chain.method)) writes.push({ file, chain });
    }
  }

  for (const { file, chain } of writes) {
    const columns = chain.method === "delete" ? "" : chain.columns ? chain.columns.join(", ") : "…";
    console.log(`    ${chain.client.padEnd(7)} ${file}:${chain.line} ${chain.table}.${chain.method}(${columns})`);
  }

  check("writes were found (the scanner sees the code)", writes.length > 0);
  check("no browser or user-session write is outside the allowed columns", outside, []);
  check("no file talks to the database's REST endpoint directly", rawRest, []);

  const offService = writes
    .filter((w) => w.chain.client !== "service")
    .map((w) => `${w.file} ${w.chain.client} ${w.chain.table}.${w.chain.method}(${(w.chain.columns ?? []).join(", ")})`);
  check(
    "setting a password still saves the name, from the browser",
    offService.includes("src/app/set-password/page.tsx browser profiles.update(full_name)"),
  );
  check(
    "profiles: the server's own writes go through the service client",
    writes.some((w) => w.chain.table === "profiles" && w.chain.client === "service"),
  );
  for (const table of ["participants", "assessment_bookings"]) {
    const forTable = writes.filter((w) => w.chain.table === table);
    check(`${table}: every write goes through the service client`, forTable.length > 0 && forTable.every((w) => w.chain.client === "service"));
  }
  const notServerSide = writes
    .filter((w) => w.chain.client === "service")
    .map((w) => w.file)
    .filter((file, i, all) => all.indexOf(file) === i)
    .filter((file) => !/\/route\.ts$/.test(file) && !/^import "server-only";/.test(read(file)));
  check("service-client writes live in server-only modules or route handlers", notServerSide, []);
}

console.log("The clients");
{
  const service = read("src/lib/supabase/service.ts");
  check("the service client is server-only", service.startsWith('import "server-only";'));
  check("…and is the only one built with the service-role key", service.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"));
  for (const file of ["src/lib/supabase/browser.ts", "src/lib/supabase/server.ts"]) {
    const source = read(file);
    check(`${file} is built with the public key, never the service-role key`, source.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") && !source.includes("SERVICE_ROLE"));
  }
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("this script is in the npm test chain", pkg.scripts.test.includes("src/scripts/test-own-row-writes.ts"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll own-row-write tests passed.");

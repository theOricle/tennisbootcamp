-- Tennis Bootcamp — limits on repeated form submissions (migration 0011)
-- Backlog #84, part 6 (audit follow-up, owner 2026-11-14).
--
-- One table the server counts form submissions in, so a script cannot repeat
-- the quiz, the booking, enroll, checkout, e-transfer, the newsletter or
-- program interest until the day's transactional emails run out, and nobody
-- can bury one inbox. The limits themselves live in code
-- (src/lib/submissionLimits.ts); this file only adds where they are counted.
--
-- What a row holds: the form (scope), a keyed hash of the network address or
-- of the email (key_hash), and when (created_at). Never the address or the
-- email itself: the hash is HMAC-SHA256 with a secret only the server holds.
-- The server deletes rows older than a day as it checks the limits.
--
-- Who may touch it: the server only (the service role). Row level security is
-- on and there is no policy, and every privilege is withdrawn from public,
-- anon and authenticated, so a visitor or a signed-in account can neither
-- read nor write a row.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0010 — there is no runner. Needs nothing
-- from them. Safe to re-run: the table and indexes are IF NOT EXISTS, the
-- checks are guarded, and the privilege statements set a final state.
-- Purely additive: no other table, column or row is added, changed or
-- removed. Until this runs, the forms work exactly as before and the server
-- logs one warning.

-- ─── The table ────────────────────────────────────────────────────────────────

create table if not exists public.submission_limits (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,
  key_hash    text not null,
  created_at  timestamptz not null default now()
);

-- The forms that are counted. A new form is a new value here, by migration.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'submission_limits_scope_check'
  ) then
    alter table public.submission_limits
      add constraint submission_limits_scope_check
      check (scope in ('intake', 'book', 'enroll', 'checkout', 'etransfer', 'newsletter', 'interest'));
  end if;
end $$;

-- A hash, never a raw value: exactly 64 lowercase hex characters.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'submission_limits_key_hash_check'
  ) then
    alter table public.submission_limits
      add constraint submission_limits_key_hash_check
      check (key_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- The window read (one key, the last day) and the day-old clean-up.
create index if not exists submission_limits_key_idx
  on public.submission_limits (key_hash, created_at);
create index if not exists submission_limits_created_idx
  on public.submission_limits (created_at);

-- ─── Who may touch it: the server only ────────────────────────────────────────

alter table public.submission_limits enable row level security;

revoke all on table public.submission_limits from public, anon, authenticated;

grant select, insert, delete on table public.submission_limits to service_role;

-- verify:
-- One row. Expected: rls_on true, policies 0, every visitor_* and account_*
-- false, every server_* true. rows_now is a count and nothing else; it may be
-- above zero once forms have been submitted, and no row is older than a day
-- for long (oldest_hours stays near or under 24).
select
  (select c.relrowsecurity from pg_class c where c.oid = 'public.submission_limits'::regclass) as rls_on,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'submission_limits') as policies,
  has_table_privilege('anon', 'public.submission_limits', 'select')            as visitor_read,
  has_table_privilege('anon', 'public.submission_limits', 'insert')            as visitor_write,
  has_table_privilege('authenticated', 'public.submission_limits', 'select')   as account_read,
  has_table_privilege('authenticated', 'public.submission_limits', 'insert')   as account_write,
  has_table_privilege('service_role', 'public.submission_limits', 'select')    as server_read,
  has_table_privilege('service_role', 'public.submission_limits', 'insert')    as server_write,
  has_table_privilege('service_role', 'public.submission_limits', 'delete')    as server_delete,
  (select count(*) from public.submission_limits)                              as rows_now,
  (select coalesce(round(extract(epoch from now() - min(created_at)) / 3600), 0)
     from public.submission_limits)                                            as oldest_hours;

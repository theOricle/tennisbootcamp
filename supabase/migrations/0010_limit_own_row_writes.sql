-- Tennis Bootcamp — limit what an account can change in its own rows (migration 0010)
-- Backlog #68.
--
-- What a signed-in account may write through the database's public interface
-- once this file has run:
--   profiles             one column of its own row: full_name (the name field
--                        on the set-password page). Every other column, the
--                        ones here today and any added later, is written by
--                        the server only.
--   participants         nothing. Every write goes through the server
--                        (src/lib/players.ts).
--   assessment_bookings  nothing. Every write goes through the server
--                        (src/lib/assessments.ts, src/lib/assessmentCredit.ts).
-- A visitor who is not signed in gets no write on profiles.
--
-- Unchanged: an account still reads its own rows, an admin still reads and
-- writes through is_admin() (0002), and the server (the service role) keeps
-- full access. src/scripts/test-own-row-writes.ts pins these limits and the
-- code that depends on them.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0009 — there is no runner. Needs 0001–0009.
-- Safe to re-run: the privilege statements set a final state and the policy
-- drops are IF EXISTS, so a second run changes nothing. No table, column or
-- row is added, changed or removed.
-- If 0002 or 0007 is ever run again, run this file again after it: those two
-- files create the three policies removed below.

-- ─── profiles: one column a signed-in account may update ──────────────────────
-- A table-wide privilege covers every column, so it is withdrawn first and the
-- one column is granted on its own. The row rule stays as it is
-- (profiles_update_own, 0001): the grant says which column, the policy says
-- which row.

revoke insert, update, delete on table public.profiles from public, anon, authenticated;

grant update (full_name) on table public.profiles to authenticated;

-- ─── participants, assessment_bookings: written by the server only ────────────
-- The read rules (…_select_own) and the admin rules (…_admin_all) stay.

drop policy if exists "participants_insert_own" on public.participants;
drop policy if exists "participants_update_own" on public.participants;
drop policy if exists "assessment_bookings_update_own" on public.assessment_bookings;

-- ─── The server keeps full access ─────────────────────────────────────────────
-- Already true on a standard Supabase project; stated here so this file does
-- not depend on it.

grant select, insert, update, delete
  on table public.profiles, public.participants, public.assessment_bookings
  to service_role;

-- verify:
-- Two statements. Run them together, in the same run as the file or on their
-- own afterwards: the report (2) lists the result of the refusal test (1).
-- The SQL editor runs a whole query as one unit, which is what carries that
-- result across; in psql, use --single-transaction.
--
-- (1) Refusal test. Acts as an ordinary signed-in account and attempts three
--     writes the limits above do not allow: its own role, its own level and
--     its own player's level, and its own booking's status, paid flag and
--     credit. Every attempt writes a column back onto itself, so no value
--     would change even if one went through. Each refusal raises the NOTICE
--     "refused: …"; an attempt that goes through raises an EXCEPTION and stops
--     the run. Everything the test does sits inside a sub-transaction that is
--     always rolled back, including the placeholder player and booking it adds
--     so the row rules have a row to act on. It reads no name, email or phone,
--     and it never prints the account it used.
-- (2) Report. One row per check, the expected value beside the actual one.
--     Expected: 12 rows, `ok` true in every row. The SQL editor does not show
--     NOTICE lines; rows 10–12 carry the refusal test's result instead.

do $$
declare
  v_account uuid;
  v_rows    bigint;
  v_role    text := 'not run';
  v_level   text := 'not run';
  v_booking text := 'not run';
begin
  -- One existing account without the admin role (an admin writes through
  -- is_admin(), by design). Chosen by sign-up order; its id is never printed.
  select p.id
    into v_account
    from public.profiles p
   where p.role is distinct from 'admin'
   order by p.created_at, p.id
   limit 1;

  if v_account is null then
    raise notice 'refusal test not run: no account without the admin role on file';
  else
    begin
      -- Placeholder rows owned by the account, so a refused update is a
      -- refusal and not an empty match. Undone with everything else below.
      insert into public.participants (account_id, full_name, relationship)
      values (v_account, 'verify-0010', 'other');
      insert into public.assessment_bookings (name, email, user_id, status)
      values ('verify-0010', 'verify-0010@example.invalid', v_account, 'requested');

      -- From here on, act as that account through the signed-in role.
      perform set_config('request.jwt.claim.sub', v_account::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', v_account, 'role', 'authenticated')::text,
        true
      );
      set local role authenticated;

      -- The account must be able to read its own rows; otherwise an update
      -- that touches nothing would prove nothing.
      perform 1 from public.profiles where id = v_account;
      if not found then
        raise exception 'verify 0010: test setup failed, the account cannot read its own profile';
      end if;
      perform 1 from public.participants where account_id = v_account;
      if not found then
        raise exception 'verify 0010: test setup failed, the account cannot read its own player';
      end if;
      perform 1 from public.assessment_bookings where user_id = v_account;
      if not found then
        raise exception 'verify 0010: test setup failed, the account cannot read its own booking';
      end if;

      -- 1. Its own role.
      begin
        update public.profiles set role = role where id = v_account;
        raise exception 'verify 0010 failed: the write to profiles.role was not refused';
      exception
        when insufficient_privilege then
          null;
      end;
      v_role := 'refused';
      raise notice 'refused: own role';

      -- 2. Its own level, and its own player's level (an existing player and
      --    a new one).
      begin
        update public.profiles set level = level where id = v_account;
        raise exception 'verify 0010 failed: the write to profiles.level was not refused';
      exception
        when insufficient_privilege then
          null;
      end;
      begin
        update public.participants set level = level where account_id = v_account;
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          raise exception 'verify 0010 failed: the write to participants.level was not refused';
        end if;
      exception
        when insufficient_privilege then
          null;
      end;
      begin
        insert into public.participants (account_id, full_name, relationship, level)
        values (v_account, 'verify-0010', 'other', 1.0);
        raise exception 'verify 0010 failed: the new participants row was not refused';
      exception
        when insufficient_privilege then
          null;
      end;
      v_level := 'refused';
      raise notice 'refused: own level and own player''s level';

      -- 3. Its own booking's status, paid flag and credit.
      begin
        update public.assessment_bookings
           set status = status, paid = paid, credit_status = credit_status
         where user_id = v_account;
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          raise exception 'verify 0010 failed: the write to assessment_bookings was not refused';
        end if;
      exception
        when insufficient_privilege then
          null;
      end;
      v_booking := 'refused';
      raise notice 'refused: own booking''s status, paid flag and credit';

      -- Always: undo everything since the inner BEGIN (the placeholder rows,
      -- the role switch, the settings).
      raise exception using errcode = 'TB010', message = 'verify 0010: undo the test';
    exception
      when sqlstate 'TB010' then
        null;
    end;
  end if;

  -- Hand the three results to the report below (kept for this run only).
  perform set_config(
    'tb0010.refusal_test',
    v_role || '|' || v_level || '|' || v_booking,
    true
  );
end $$;

select
  c.check_name                       as "check",
  c.expected,
  c.actual,
  coalesce(c.actual = c.expected, false) as ok
from (
  values
    (
      1,
      'profiles: columns a signed-in account may update'::text,
      'full_name'::text,
      (select coalesce(string_agg(a.attname::text, ', ' order by a.attname), 'none')
         from pg_attribute a
        where a.attrelid = 'public.profiles'::regclass
          and a.attnum > 0
          and not a.attisdropped
          and has_column_privilege('authenticated'::name, a.attrelid, a.attnum, 'UPDATE'::text))
    ),
    (
      2,
      'profiles: insert or delete for a signed-in account',
      'none',
      coalesce(nullif(concat_ws(', ',
        case when has_any_column_privilege('authenticated'::name, 'public.profiles'::regclass, 'INSERT'::text) then 'INSERT' end,
        case when has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'DELETE'::text) then 'DELETE' end
      ), ''), 'none')
    ),
    (
      3,
      'profiles: insert, update or delete for a visitor who is not signed in',
      'none',
      coalesce(nullif(concat_ws(', ',
        case when has_any_column_privilege('anon'::name, 'public.profiles'::regclass, 'INSERT'::text) then 'INSERT' end,
        case when has_any_column_privilege('anon'::name, 'public.profiles'::regclass, 'UPDATE'::text) then 'UPDATE' end,
        case when has_table_privilege('anon'::name, 'public.profiles'::regclass, 'DELETE'::text) then 'DELETE' end
      ), ''), 'none')
    ),
    (
      4,
      'server: insert, update and delete on the three tables',
      '9 of 9',
      (select count(*)::text || ' of 9'
         from (values ('public.profiles'::regclass),
                      ('public.participants'::regclass),
                      ('public.assessment_bookings'::regclass)) as t (tbl)
        cross join (values ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)) as p (priv)
        where has_table_privilege('service_role'::name, t.tbl, p.priv))
    ),
    (
      5,
      'server: not subject to the row rules',
      'true',
      coalesce(
        (select r.rolbypassrls::text from pg_roles r where r.rolname = 'service_role'),
        'role not found')
    ),
    (
      6,
      'row rules switched on for the three tables',
      '3 of 3',
      (select count(*)::text || ' of 3'
         from pg_class k
        where k.oid in ('public.profiles'::regclass,
                        'public.participants'::regclass,
                        'public.assessment_bookings'::regclass)
          and k.relrowsecurity)
    ),
    (
      7,
      'profiles: policies',
      'profiles_select_own (SELECT), profiles_update_own (UPDATE)',
      (select coalesce(string_agg(pol.policyname::text || ' (' || pol.cmd || ')', ', ' order by pol.policyname), 'none')
         from pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'profiles')
    ),
    (
      8,
      'participants: policies',
      'participants_admin_all (ALL), participants_select_own (SELECT)',
      (select coalesce(string_agg(pol.policyname::text || ' (' || pol.cmd || ')', ', ' order by pol.policyname), 'none')
         from pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'participants')
    ),
    (
      9,
      'assessment_bookings: policies',
      'assessment_bookings_admin_all (ALL), assessment_bookings_select_own (SELECT)',
      (select coalesce(string_agg(pol.policyname::text || ' (' || pol.cmd || ')', ', ' order by pol.policyname), 'none')
         from pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'assessment_bookings')
    ),
    (
      10,
      'refusal test: own role',
      'refused',
      coalesce(nullif(split_part(coalesce(current_setting('tb0010.refusal_test', true), ''), '|', 1), ''), 'not run')
    ),
    (
      11,
      'refusal test: own level and own player''s level',
      'refused',
      coalesce(nullif(split_part(coalesce(current_setting('tb0010.refusal_test', true), ''), '|', 2), ''), 'not run')
    ),
    (
      12,
      'refusal test: own booking''s status, paid flag and credit',
      'refused',
      coalesce(nullif(split_part(coalesce(current_setting('tb0010.refusal_test', true), ''), '|', 3), ''), 'not run')
    )
) as c (ord, check_name, expected, actual)
order by c.ord;

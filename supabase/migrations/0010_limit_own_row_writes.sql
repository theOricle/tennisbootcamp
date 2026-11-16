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
-- A visitor who is not signed in gets no write on any of the three.
--
-- Two layers:
--   1. Privileges. Insert, update and delete on the three tables are withdrawn
--      from public, anon and authenticated, and the one profiles column is
--      granted back to authenticated. Truncate, references and trigger are
--      withdrawn from anon and authenticated as well. Select is not touched.
--   2. Row rules. The own-row write policies on participants and
--      assessment_bookings are removed. profiles_update_own (0001) stays: it
--      says in which row the one granted column may be updated.
-- On participants and assessment_bookings each layer is enough on its own. A
-- policy can only narrow what a privilege allows, so while layer 1 is in place
-- a write policy on either table gives a signed-in account nothing, whichever
-- file created it. On profiles the two work together: which column, which row.
--
-- Unchanged: an account still reads its own rows (the …_select_own policies
-- and the select privilege), and the server (the service role) keeps full
-- access. The admin policies (…_admin_all, through is_admin()) stay in place;
-- with layer 1 they cover reads, and the admin pages write through the server
-- like every other page. src/scripts/test-own-row-writes.ts pins these limits
-- and the code that depends on them.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0009 — there is no runner. Needs 0001–0009.
-- Safe to re-run: the privilege statements set a final state and the policy
-- drops are IF EXISTS, so a second run changes nothing. No table, column or
-- row is added, changed or removed.
-- If 0002 or 0007 is ever run again, run this file again after it: those two
-- files create the three policies removed in layer 2. Layer 1 holds in the
-- meantime, and report rows 12–13 list the extra policies until then.

-- ─── Layer 1: privileges ──────────────────────────────────────────────────────
-- profiles: one column a signed-in account may update. A table-wide privilege
-- covers every column, so it is withdrawn first and the one column is granted
-- on its own: the grant says which column, the policy (layer 2) says which row.

revoke insert, update, delete on table public.profiles from public, anon, authenticated;

grant update (full_name) on table public.profiles to authenticated;

-- participants, assessment_bookings: written by the server only.

revoke insert, update, delete
  on table public.participants, public.assessment_bookings
  from public, anon, authenticated;

-- The three tables: truncate, references and trigger are withdrawn from a
-- signed-in account and a visitor as well. Select stays as it is.

revoke truncate, references, trigger
  on table public.profiles, public.participants, public.assessment_bookings
  from anon, authenticated;

-- ─── Layer 2: row rules ───────────────────────────────────────────────────────
-- participants, assessment_bookings: no own-row write policy. The read rules
-- (…_select_own) and the admin rules (…_admin_all) stay, and so does
-- profiles_update_own (0001).

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
-- Before you run it: at least one ordinary account (one that is not an admin)
-- must exist, because the refusal test acts as one. Any test sign-up will do.
-- Without one the refusal test does not run, and report rows 15–17 read
-- "not run: needs an account that is not an admin" with `ok` false.
--
-- Two statements. Run them together, in the same run as the file or on their
-- own afterwards: the report (2) lists the result of the refusal test (1).
-- The SQL editor runs a whole query as one unit, which is what carries that
-- result across; in psql, use --single-transaction. (A bare "not run" in rows
-- 15–17 means the report was run without the refusal test.)
-- When the whole file is pasted and run in one go, that one unit includes the
-- migration above: an assertion that fails in the refusal test stops the run
-- and undoes the migration itself as well, so nothing is left half-applied.
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
--     Expected: 17 rows, `ok` true in every row. Row 14 is a count and nothing
--     else. The SQL editor does not show NOTICE lines; rows 15–17 carry the
--     refusal test's result instead.

do $$
declare
  v_account uuid;
  v_rows    bigint;
  v_role    text := 'not run';
  v_level   text := 'not run';
  v_booking text := 'not run';
begin
  -- One existing account without the admin role: the test is about what an
  -- ordinary account may write. Chosen by sign-up order; its id is never
  -- printed.
  select p.id
    into v_account
    from public.profiles p
   where p.role is distinct from 'admin'
   order by p.created_at, p.id
   limit 1;

  if v_account is null then
    -- The prerequisite is not met: say what is needed, in the report too.
    v_role    := 'not run: needs an account that is not an admin';
    v_level   := v_role;
    v_booking := v_role;
    raise notice 'refusal test not run: needs an account that is not an admin';
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
      'participants: insert, update or delete for a signed-in account or a visitor',
      'none',
      (select coalesce(string_agg(r.rol::text || ' ' || p.priv, ', ' order by r.rol::text, p.priv), 'none')
         from (values ('anon'::name), ('authenticated'::name)) as r (rol)
        cross join (values ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)) as p (priv)
        where case when p.priv = 'DELETE'
                   then has_table_privilege(r.rol, 'public.participants'::regclass, p.priv)
                   else has_any_column_privilege(r.rol, 'public.participants'::regclass, p.priv)
              end)
    ),
    (
      5,
      'assessment_bookings: insert, update or delete for a signed-in account or a visitor',
      'none',
      (select coalesce(string_agg(r.rol::text || ' ' || p.priv, ', ' order by r.rol::text, p.priv), 'none')
         from (values ('anon'::name), ('authenticated'::name)) as r (rol)
        cross join (values ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)) as p (priv)
        where case when p.priv = 'DELETE'
                   then has_table_privilege(r.rol, 'public.assessment_bookings'::regclass, p.priv)
                   else has_any_column_privilege(r.rol, 'public.assessment_bookings'::regclass, p.priv)
              end)
    ),
    (
      6,
      'three tables: truncate, references or trigger for a signed-in account or a visitor',
      'none',
      (select coalesce(string_agg(r.rol::text || ' ' || p.priv || ' on ' || t.tbl::text, ', ' order by t.tbl::text, r.rol::text, p.priv), 'none')
         from (values ('anon'::name), ('authenticated'::name)) as r (rol)
        cross join (values ('public.profiles'::regclass),
                           ('public.participants'::regclass),
                           ('public.assessment_bookings'::regclass)) as t (tbl)
        cross join (values ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text)) as p (priv)
        where case when p.priv = 'REFERENCES'
                   then has_any_column_privilege(r.rol, t.tbl, p.priv)
                   else has_table_privilege(r.rol, t.tbl, p.priv)
              end)
    ),
    (
      7,
      'signed-in account: select on the three tables',
      '3 of 3',
      (select count(*)::text || ' of 3'
         from (values ('public.profiles'::regclass),
                      ('public.participants'::regclass),
                      ('public.assessment_bookings'::regclass)) as t (tbl)
        where has_table_privilege('authenticated'::name, t.tbl, 'SELECT'::text))
    ),
    (
      8,
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
      9,
      'server: not subject to the row rules',
      'true',
      coalesce(
        (select r.rolbypassrls::text from pg_roles r where r.rolname = 'service_role'),
        'role not found')
    ),
    (
      10,
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
      11,
      'profiles: policies',
      'profiles_select_own (SELECT), profiles_update_own (UPDATE)',
      (select coalesce(string_agg(pol.policyname::text || ' (' || pol.cmd || ')', ', ' order by pol.policyname), 'none')
         from pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'profiles')
    ),
    (
      12,
      'participants: policies',
      'participants_admin_all (ALL), participants_select_own (SELECT)',
      (select coalesce(string_agg(pol.policyname::text || ' (' || pol.cmd || ')', ', ' order by pol.policyname), 'none')
         from pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'participants')
    ),
    (
      13,
      'assessment_bookings: policies',
      'assessment_bookings_admin_all (ALL), assessment_bookings_select_own (SELECT)',
      (select coalesce(string_agg(pol.policyname::text || ' (' || pol.cmd || ')', ', ' order by pol.policyname), 'none')
         from pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'assessment_bookings')
    ),
    (
      14,
      'accounts with the admin role',
      '1',
      (select count(*)::text from public.profiles p where p.role = 'admin')
    ),
    (
      15,
      'refusal test: own role',
      'refused',
      coalesce(nullif(split_part(coalesce(current_setting('tb0010.refusal_test', true), ''), '|', 1), ''), 'not run')
    ),
    (
      16,
      'refusal test: own level and own player''s level',
      'refused',
      coalesce(nullif(split_part(coalesce(current_setting('tb0010.refusal_test', true), ''), '|', 2), ''), 'not run')
    ),
    (
      17,
      'refusal test: own booking''s status, paid flag and credit',
      'refused',
      coalesce(nullif(split_part(coalesce(current_setting('tb0010.refusal_test', true), ''), '|', 3), ''), 'not run')
    )
) as c (ord, check_name, expected, actual)
order by c.ord;

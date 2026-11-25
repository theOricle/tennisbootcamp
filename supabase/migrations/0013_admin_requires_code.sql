-- 0013: an admin counts in the database only on a session that has passed the
-- sign-in code (backlog #92).
--
-- The coach's account signs in with a password and then a 6-digit code from an
-- authenticator app (Supabase MFA, TOTP). A session that has passed the code
-- carries the claim aal = 'aal2' in its access token; a password-only session
-- carries 'aal1'. Until now is_admin() looked at profiles.role alone, so a
-- password-only session of the admin account passed every admin policy.
--
-- This replaces the function body and nothing else: same name, same return
-- type, same security definer, stable and search_path, same grants. Every
-- policy that calls is_admin() keeps calling it and needs no change.
--
-- Idempotent (create or replace) and additive: no table, column, policy or
-- row is touched. Safe to run twice.
--
-- Apply only after the coach has set the code up and signed in with it once.
-- Applied before that, the admin account passes no admin policy until it has.
-- The site's own admin pages and APIs do not depend on this function (they
-- check the role and the level on the server with the service-role client),
-- so they behave the same before and after it runs.

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
    and (select auth.jwt()->>'aal') = 'aal2',
    false
  );
$$;

-- Unchanged from 0002: no direct calls by anon/public; authenticated needs
-- EXECUTE so the function can be evaluated inside RLS policy clauses.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- verify:
-- One row. Expected: security_definer true, stable true, search_path_public
-- true, requires_aal2 true, anon_can_call false, authenticated_can_call true.
-- policies_calling_is_admin lists every policy that still calls is_admin():
-- the same list as before this ran (the migration files define six: two on
-- the assessment tables in 0002, three on the cohort tables in 0004 and one
-- on participants in 0007).
select
  p.prosecdef                                                as security_definer,
  p.provolatile = 's'                                        as stable,
  coalesce(p.proconfig @> array['search_path=public'], false) as search_path_public,
  pg_get_functiondef(p.oid) like '%''aal2''%'                as requires_aal2,
  has_function_privilege('anon', p.oid, 'execute')           as anon_can_call,
  has_function_privilege('authenticated', p.oid, 'execute')  as authenticated_can_call,
  (select coalesce(string_agg(pol.tablename || '.' || pol.policyname, ', '
                              order by pol.tablename, pol.policyname), 'none')
     from pg_policies pol
    where coalesce(pol.qual, '') ilike '%is_admin()%'
       or coalesce(pol.with_check, '') ilike '%is_admin()%')  as policies_calling_is_admin
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';

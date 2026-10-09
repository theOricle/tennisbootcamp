-- Tennis Bootcamp — link enrollments to accounts (migration 0008)
-- Audit 2026-10-09, finding H5: enrollment rows were inserted with no
-- user_id, and only the brand-new-email invite branch ever set one. The
-- dashboard and /profile read enrollments by user_id under RLS
-- (enrollments_select_own, 0001_init.sql), so a player who took the quiz
-- first — and so already had an account — paid and then saw "You haven't
-- enrolled in any programs yet".
--
-- From PR B on, every save path writes user_id (the session's user, else the
-- account that exists for the contact email) and the activation step links
-- any row it finds unowned. This backfills the rows written before that, by
-- the same rule: contact_email ↔ auth.users.email, trimmed, case-insensitive.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0007 — there is no runner.
-- Safe to re-run: the update only touches rows whose user_id is null, so a
-- second run is a no-op. Purely additive: no column is added, renamed,
-- dropped or retyped, and no owned row is ever changed.

-- before (optional): how many rows are unowned right now?
--   select count(*) from public.enrollments where user_id is null;

update public.enrollments e
   set user_id = u.id
  from auth.users u
 where e.user_id is null
   and e.contact_email is not null
   and lower(btrim(e.contact_email)) = lower(u.email);

-- verify:
-- `linkable_but_unlinked` must be 0 after the run. `unlinked` may stay above
-- zero: those rows belong to emails with no account yet (a guest whose
-- invite send failed); the next enrollment, quiz or activation for that
-- email links them at runtime.
select
  count(*)                                               as total,
  count(*) filter (where e.user_id is null)              as unlinked,
  count(*) filter (
    where e.user_id is null
      and e.contact_email is not null
      and exists (
        select 1 from auth.users u
         where lower(u.email) = lower(btrim(e.contact_email))
      )
  )                                                      as linkable_but_unlinked
from public.enrollments e;

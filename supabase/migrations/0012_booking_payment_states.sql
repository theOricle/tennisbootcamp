-- Tennis Bootcamp — booking states for test, refunded and disputed payments (migration 0012)
-- Backlog #84, review fix 2 (audit follow-up, owner 2026-11-14).
--
-- An assessment booking paid in Stripe's test mode becomes a test booking, and
-- one whose payment is refunded in full or disputed becomes refunded or
-- disputed. None of the three holds a slot (only 'pending' and 'booked' do, in
-- the one-active-hold index of 0002), so the slot is free for a real booking,
-- and the admin assessments list names each one ("Test booking", "Refunded",
-- "Disputed"). This file only widens the status check to allow the three; the
-- code that writes them lives in src/lib/assessments.ts and
-- src/lib/paymentReversal.ts.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0011 — there is no runner. Needs 0002 and
-- 0003 (the check it replaces). Safe to re-run: the do-block replaces the
-- check with the same definition. Additive in effect: every status allowed
-- before is still allowed, and no column or row is added, changed or
-- removed. Until this runs, the code writes 'cancelled' in their place, which
-- also frees the slot; the admin list then shows those bookings as Cancelled.

do $$ begin
  if exists (
    select 1 from pg_constraint where conname = 'assessment_bookings_status_check'
  ) then
    alter table public.assessment_bookings
      drop constraint assessment_bookings_status_check;
  end if;
  alter table public.assessment_bookings
    add constraint assessment_bookings_status_check
    check (status in ('pending','booked','completed','no_show','cancelled','expired','requested','test','refunded','disputed'));
end $$;

-- verify:
-- One row. Expected: allows_payment_states true, still_allows_requested true,
-- slot_index_unchanged true. bookings_by_state is a count per status and
-- nothing else.
select
  (select pg_get_constraintdef(c.oid) like '%''test''%'
          and pg_get_constraintdef(c.oid) like '%''refunded''%'
          and pg_get_constraintdef(c.oid) like '%''disputed''%'
     from pg_constraint c where c.conname = 'assessment_bookings_status_check') as allows_payment_states,
  (select pg_get_constraintdef(c.oid) like '%''requested''%'
     from pg_constraint c where c.conname = 'assessment_bookings_status_check') as still_allows_requested,
  (select coalesce(bool_and(i.indexdef like '%''pending''%' and i.indexdef like '%''booked''%'
                            and i.indexdef not like '%''test''%'), false)
     from pg_indexes i
    where i.schemaname = 'public' and i.tablename = 'assessment_bookings'
      and i.indexdef ilike '%unique%' and i.indexdef ilike '%slot_start%') as slot_index_unchanged,
  (select coalesce(string_agg(s.status || ': ' || s.n, ', ' order by s.status), 'none')
     from (select status, count(*) as n from public.assessment_bookings group by status) s) as bookings_by_state;

-- Tennis Bootcamp — e-transfer payment rail + admin mark-paid (migration 0006)
-- Backlog #12: cohort 1 is paid by e-transfer and marked paid by the coach,
-- while Stripe card checkout stays fully wired.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0004 — there is no runner.
-- Safe to re-run: every statement is IF NOT EXISTS / guarded.
-- Purely additive: no column is renamed, dropped, or retyped, and every new
-- column has a default or is nullable, so existing rows and code keep working.
-- (0005 is not present in this branch; the number is reserved per the backlog.)

-- ─── cohorts.payment_mode ─────────────────────────────────────────────────────
-- How players pay for this cohort. 'card' = Stripe Checkout (unchanged
-- behaviour); 'etransfer' = the enroll wizard shows Interac e-transfer
-- instructions and the coach marks each invite paid in /admin/cohorts/[id].

alter table public.cohorts
  add column if not exists payment_mode text not null default 'card';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'cohorts_payment_mode_check'
  ) then
    alter table public.cohorts
      add constraint cohorts_payment_mode_check
      check (payment_mode in ('card', 'etransfer'));
  end if;
end $$;

-- ─── cohort_invites payment details ───────────────────────────────────────────
-- payment_method: the rail the spot was (or is being) paid on. Set to
--   'etransfer' when the player taps "I've sent it" or the coach marks the
--   invite paid; 'card' is recorded best-effort by the Stripe path.
-- payment_note:   free text from the coach ("e-transfer received 2026-09-30, ref …").
-- paid_at:        when the invite flipped to paid (null once undone).

alter table public.cohort_invites
  add column if not exists payment_method text,
  add column if not exists payment_note   text,
  add column if not exists paid_at        timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'cohort_invites_payment_method_check'
  ) then
    alter table public.cohort_invites
      add constraint cohort_invites_payment_method_check
      check (payment_method is null or payment_method in ('card', 'etransfer'));
  end if;
end $$;

-- ─── Notes ────────────────────────────────────────────────────────────────────
--
-- RLS is unchanged: all writes still go through the service-role client from
-- server modules (src/lib/cohortActions.ts), admin reads via is_admin().
--
-- Until this migration runs, the card path behaves exactly as before (the
-- payment-detail write on the Stripe path is best-effort and ignores a
-- missing column); the admin "Mark paid" action and the e-transfer step
-- require it and surface a clear error otherwise.

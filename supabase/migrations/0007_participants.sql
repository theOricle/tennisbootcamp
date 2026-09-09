-- Tennis Bootcamp — household accounts: one holder, many participants (migration 0007)
-- Backlog #11: one account holder (a parent, a spouse) registers several
-- people, and every flow knows who it is for.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0006 — there is no runner.
-- Safe to re-run: every statement is IF NOT EXISTS / guarded, and the backfills
-- are all `where not exists` / `where … is null`, so a second run is a no-op.
-- Purely additive: no column is renamed, dropped, or retyped. `profiles` keeps
-- every column it has; the 'self' participant mirrors it during the transition.

-- ─── participants ─────────────────────────────────────────────────────────────
-- One row per person who actually trains. The account holder is `relationship
-- = 'self'`; children and a spouse are additional rows under the same
-- account_id. Level + availability move here — profiles keeps its copy in sync
-- for the 'self' participant while the transition finishes.

create table if not exists public.participants (
  id                      uuid primary key default gen_random_uuid(),
  account_id              uuid not null references auth.users(id) on delete cascade,
  full_name               text not null,
  relationship            text not null
    check (relationship in ('self','child','spouse','other')),
  is_minor                boolean not null default false,
  level                   numeric(2,1),          -- coach-assigned, NTRP-style 1.0–7.0 halves
  level_assessed_at       timestamptz,
  level_notes             text,                  -- coach's short written note
  availability            jsonb,                 -- weekly template, same shape as profiles.availability
  availability_updated_at timestamptz,
  availability_source     text
    check (
      availability_source is null
      or availability_source in ('intake','request','assessment','dashboard')
    ),
  availability_note       text,
  created_at              timestamptz not null default now()
);

alter table public.participants enable row level security;

-- ─── Backfill: one 'self' participant per existing profile ────────────────────
-- Every account that exists today is a single player. Copy their name, level
-- and availability (with its provenance from 0005) onto a 'self' participant
-- so nothing is lost and existing users keep working unchanged.

insert into public.participants (
  account_id, full_name, relationship, is_minor,
  level, level_assessed_at, level_notes,
  availability, availability_updated_at, availability_source, availability_note,
  created_at
)
select
  p.id,
  coalesce(nullif(btrim(p.full_name), ''), 'Account holder'),
  'self',
  false,
  p.level, p.level_assessed_at, p.level_notes,
  p.availability, p.availability_updated_at, p.availability_source, p.availability_note,
  coalesce(p.created_at, now())
from public.profiles p
where not exists (
  select 1 from public.participants x
   where x.account_id = p.id and x.relationship = 'self'
);

-- ─── participant_id on the flows ──────────────────────────────────────────────
-- Nullable everywhere: a row written before this migration (or by a client that
-- hasn't been redeployed) keeps working, and the code falls back to email.

alter table public.assessment_bookings
  add column if not exists participant_id uuid references public.participants(id);

alter table public.cohort_invites
  add column if not exists participant_id uuid references public.participants(id);

-- Backfill each existing row to the holder's 'self' participant, resolved by
-- user_id when the row carries one, else by the email on the auth user.
-- Unresolvable rows (a guest booking with no account yet) stay null — the code
-- resolves them lazily the next time it touches the row.

update public.assessment_bookings b
   set participant_id = s.id
  from public.participants s
 where b.participant_id is null
   and s.relationship = 'self'
   and s.account_id = b.user_id;

update public.assessment_bookings b
   set participant_id = s.id
  from public.participants s
  join auth.users u on u.id = s.account_id
 where b.participant_id is null
   and b.user_id is null
   and s.relationship = 'self'
   and lower(btrim(u.email)) = lower(btrim(b.email));

update public.cohort_invites i
   set participant_id = s.id
  from public.participants s
 where i.participant_id is null
   and s.relationship = 'self'
   and s.account_id = i.user_id;

update public.cohort_invites i
   set participant_id = s.id
  from public.participants s
  join auth.users u on u.id = s.account_id
 where i.participant_id is null
   and i.user_id is null
   and s.relationship = 'self'
   and lower(btrim(u.email)) = lower(btrim(i.email));

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- A holder reads, adds and edits their own people. Nobody deletes from the
-- client (a participant with bookings behind them is history, not a typo).
-- Admins get everything through is_admin() (defined in 0002). Every server
-- write still goes through the service-role client in src/lib/players.ts.

do $$ begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'participants' and policyname = 'participants_select_own'
  ) then
    create policy "participants_select_own" on public.participants
      for select using (account_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'participants' and policyname = 'participants_insert_own'
  ) then
    create policy "participants_insert_own" on public.participants
      for insert with check (account_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'participants' and policyname = 'participants_update_own'
  ) then
    create policy "participants_update_own" on public.participants
      for update using (account_id = auth.uid())
      with check (account_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'participants' and policyname = 'participants_admin_all'
  ) then
    create policy "participants_admin_all" on public.participants
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- The dashboard and the chooser read every participant for one account; the
-- admin list and the cohort matrix filter and sort on level.

create index if not exists participants_account_idx
  on public.participants (account_id);

create index if not exists participants_level_idx
  on public.participants (level);

create index if not exists assessment_bookings_participant_idx
  on public.assessment_bookings (participant_id);

create index if not exists cohort_invites_participant_idx
  on public.cohort_invites (participant_id);

-- ─── Notes ────────────────────────────────────────────────────────────────────
--
-- No policy grants anon anything, and no column is dropped from profiles:
-- profiles.level / availability stay authoritative for the 'self' participant
-- and are written alongside it by src/lib/players.ts, so anything still reading
-- the profile directly keeps seeing the truth.
--
-- Until this migration runs, src/lib/players.ts falls back to profiles and
-- synthesizes a single 'self' participant per account (id = the account id),
-- so the deployed site behaves exactly as it did before 0007.
--
-- Availability JSON format is unchanged:
--   {"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}
-- Band hours (the displayed standard) live in src/lib/availability.ts:
--   Morning 8:00–12:00 · Afternoon 12:00–16:00 · Evening 16:00–20:00.

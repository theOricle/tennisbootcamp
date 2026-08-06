-- Tennis Bootcamp — Phase 3 admin core + private cohorts (migration 0004)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0003 — there is no runner.
-- Safe to re-run: all statements use IF NOT EXISTS / guarded blocks / ON CONFLICT.
--
-- (The plan originally numbered this 0003_cohorts_admin.sql; Phase 2.6 consumed
-- 0003 with the request-a-time migration, so this is 0004. The plan text has
-- been amended to match.)

-- ─── cohorts ──────────────────────────────────────────────────────────────────
-- Admin-created (and seeded) program cohorts. String ids keep existing
-- /enroll/[cohortId] links working — the seed below reuses the static-content ids.

create table if not exists public.cohorts (
  id                text primary key,             -- keep string ids compatible with /enroll/[cohortId]
  program_id        text not null,                -- FK by convention → src/content/programs.ts ids
  label             text not null,
  level_min         numeric(2,1),                 -- coach-level band this cohort is built for
  level_max         numeric(2,1),                 -- (both null = not tier-gated, e.g. kids camp)
  location_label    text,                         -- free text; venue-naming rule applies.
                                                  -- Seeds carry the static location id (balliol/king)
                                                  -- so existing venue lookups keep resolving.
  start_date        date not null,
  weeks             int  not null,
  sessions          jsonb not null,               -- [{"day":"Tue","start":"18:00","end":"19:00"}] — mirrors SessionSlot
  price_cents       int  not null,
  currency          text not null default 'CAD',
  capacity_min      int  not null default 3,      -- minimum-to-run
  capacity_max      int  not null,
  visibility        text not null default 'public'
    check (visibility in ('public','private')),
  status            text not null default 'draft'
    check (status in ('draft','inviting','confirmed','running','completed','cancelled')),
  invite_hold_hours int  not null default 48,
  makeup_max_weeks  int  not null default 2,
  credit_followup   boolean not null default false, -- set when cancellations exceed the make-up cap
  created_at        timestamptz not null default now()
);

alter table public.cohorts enable row level security;

create index if not exists cohorts_program_idx on public.cohorts (program_id);
create index if not exists cohorts_status_idx  on public.cohorts (status);

-- ─── cohort_invites ───────────────────────────────────────────────────────────
-- Personal, single-use invite tokens with a hold window (default 48h).

create table if not exists public.cohort_invites (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  text not null references public.cohorts(id),
  email      text not null,
  user_id    uuid references auth.users(id),
  token      text not null unique,               -- random, single-use, carried on the enroll link
  status     text not null default 'invited'
    check (status in ('invited','paid','declined','expired')),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null                -- invited_at + cohort.invite_hold_hours
);

alter table public.cohort_invites enable row level security;

create index if not exists cohort_invites_cohort_idx on public.cohort_invites (cohort_id);
create index if not exists cohort_invites_email_idx  on public.cohort_invites (lower(email));

-- ─── cohort_sessions ──────────────────────────────────────────────────────────
-- Concrete dated sessions, generated when a cohort is confirmed
-- (weeks × sessions/week). Cancelling one appends a make-up row.

create table if not exists public.cohort_sessions (
  id                  uuid primary key default gen_random_uuid(),
  cohort_id           text not null references public.cohorts(id),
  session_date        date not null,
  start_time          time not null,
  end_time            time not null,
  status              text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled')),
  cancellation_reason text,
  makeup_for          uuid references public.cohort_sessions(id), -- set on appended make-up rows
  created_at          timestamptz not null default now()
);

alter table public.cohort_sessions enable row level security;

create index if not exists cohort_sessions_cohort_idx
  on public.cohort_sessions (cohort_id, session_date);

-- One session per (cohort, date, start) — makes make-up appending idempotent
-- and double-generation impossible at the database level.
create unique index if not exists cohort_sessions_slot_unique
  on public.cohort_sessions (cohort_id, session_date, start_time);

-- ─── RLS policies ─────────────────────────────────────────────────────────────
-- Writes happen server-side via the service-role client (bypasses RLS), same as
-- enrollments/assessments. Admin gets full access via is_admin() (from 0002).
-- Cohorts + sessions carry no personal data (schedule, price, level band), so
-- signed-in players may read them — the dashboard "Open for your tier" list and
-- session lists build on that. Invites contain emails: self-read only.

-- cohorts: signed-in read
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cohorts' and policyname = 'cohorts_select_authenticated'
  ) then
    create policy "cohorts_select_authenticated" on public.cohorts
      for select to authenticated using (true);
  end if;
end $$;

-- cohorts: admin full access
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cohorts' and policyname = 'cohorts_admin_all'
  ) then
    create policy "cohorts_admin_all" on public.cohorts
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- cohort_sessions: signed-in read
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cohort_sessions' and policyname = 'cohort_sessions_select_authenticated'
  ) then
    create policy "cohort_sessions_select_authenticated" on public.cohort_sessions
      for select to authenticated using (true);
  end if;
end $$;

-- cohort_sessions: admin full access
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cohort_sessions' and policyname = 'cohort_sessions_admin_all'
  ) then
    create policy "cohort_sessions_admin_all" on public.cohort_sessions
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- cohort_invites: self read (attached by user_id when the account exists)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cohort_invites' and policyname = 'cohort_invites_select_own'
  ) then
    create policy "cohort_invites_select_own" on public.cohort_invites
      for select using ((select auth.uid()) = user_id);
  end if;
end $$;

-- cohort_invites: admin full access
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cohort_invites' and policyname = 'cohort_invites_admin_all'
  ) then
    create policy "cohort_invites_admin_all" on public.cohort_invites
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- ─── Seed from src/content/cohorts.ts ─────────────────────────────────────────
-- Same ids as the static file so existing /enroll/[cohortId] links keep working.
-- Static display statuses map onto the lifecycle: "open" → confirmed (publicly
-- enrollable), "upcoming" → draft. location_label carries the static location id.
-- ON CONFLICT DO NOTHING keeps re-runs (and later admin edits) safe.

insert into public.cohorts
  (id, program_id, label, location_label, start_date, weeks, sessions,
   price_cents, currency, capacity_min, capacity_max, visibility, status)
values
  ('bootcamps-balliol-summer-2026', 'bootcamps', 'Summer Cohort', 'balliol',
   '2026-06-07', 6,
   '[{"day":"Wed","start":"17:00","end":"18:00"},{"day":"Fri","start":"17:00","end":"18:00"}]'::jsonb,
   64900, 'CAD', 6, 8, 'public', 'confirmed'),
  ('bootcamps-king-summer-2026', 'bootcamps', 'Summer Cohort', 'king',
   '2026-06-10', 6,
   '[{"day":"Tue","start":"18:00","end":"19:00"},{"day":"Thu","start":"18:00","end":"19:00"}]'::jsonb,
   64900, 'CAD', 6, 8, 'public', 'confirmed'),
  ('kids-summer-camp-balliol-week1-2026', 'kids-summer-camp', 'Week 1 — July', 'balliol',
   '2026-07-07', 1,
   '[{"day":"Mon","start":"09:00","end":"15:00"},{"day":"Tue","start":"09:00","end":"15:00"},{"day":"Wed","start":"09:00","end":"15:00"},{"day":"Thu","start":"09:00","end":"15:00"},{"day":"Fri","start":"09:00","end":"15:00"}]'::jsonb,
   49900, 'CAD', 6, 12, 'public', 'draft'),
  ('kids-summer-camp-balliol-week2-2026', 'kids-summer-camp', 'Week 2 — August', 'balliol',
   '2026-08-04', 1,
   '[{"day":"Mon","start":"09:00","end":"15:00"},{"day":"Tue","start":"09:00","end":"15:00"},{"day":"Wed","start":"09:00","end":"15:00"},{"day":"Thu","start":"09:00","end":"15:00"},{"day":"Fri","start":"09:00","end":"15:00"}]'::jsonb,
   49900, 'CAD', 6, 12, 'public', 'draft'),
  ('group-lessons-king-fall-2026', 'group-lessons', 'Fall Session', 'king',
   '2026-09-08', 7,
   '[{"day":"Mon","start":"19:00","end":"20:30"},{"day":"Sat","start":"10:00","end":"11:30"}]'::jsonb,
   59900, 'CAD', 4, 6, 'public', 'confirmed')
on conflict (id) do nothing;

-- ─── Notes ────────────────────────────────────────────────────────────────────
--
-- Display mapping (src/lib/cohortsDb.ts): draft → "upcoming", inviting/confirmed
-- → "open", running/completed/cancelled → not publicly enrollable. The static
-- file src/content/cohorts.ts is now deprecated for writes — edit cohorts in
-- /admin/cohorts — and remains only as the build-time/unconfigured fallback.
--
-- cohort_sessions rows are generated by the app when a cohort confirms (or on
-- first admin open of a confirmed cohort's detail page for seeded rows).
--
-- Make-up rules (Appendix B of ops/plans/assessment-restructure.md) live in
-- src/lib/makeup.ts; the cap is cohorts.makeup_max_weeks (default 2 weeks),
-- overflow flips credit_followup = true for admin follow-up.

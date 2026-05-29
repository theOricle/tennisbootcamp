-- Tennis Bootcamp — Phase 6 initial schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.

-- ─── profiles ────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text,
  phone      text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Users can read and update their own profile; no client-side insert/delete.
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy "profiles_select_own" on profiles
      for select using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy "profiles_update_own" on profiles
      for update using (auth.uid() = id);
  end if;
end $$;

-- Auto-create a profile row whenever a user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── enrollments ─────────────────────────────────────────────────────────────

create table if not exists enrollments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users,
  cohort_id            text not null,
  program              text,
  location             text,
  participant_name     text,
  participant_dob      date,
  is_minor             boolean,
  contact_email        text,
  contact_phone        text,
  guardian_name        text,
  guardian_email       text,
  guardian_phone       text,
  consent_signed_name  text,
  consent_agreed_at    timestamptz,
  waiver_version       text,
  status               text default 'pending',
  created_at           timestamptz default now()
);

alter table enrollments enable row level security;

-- Users can only read their own enrollments (user_id must match).
-- All inserts and updates are done server-side via the service_role — no client policy needed.
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'enrollments' and policyname = 'enrollments_select_own'
  ) then
    create policy "enrollments_select_own" on enrollments
      for select using (auth.uid() = user_id);
  end if;
end $$;

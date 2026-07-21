# Plan — Assessment-First Restructure

**Status:** Draft for execution by Claude Code
**Author:** Cowork planning session, 2026-07-18
**Owner:** Sina
**Supersedes:** `ops/plans/enrollment-and-accounts.md` as the active build plan (all of its phases shipped and merged by 2026-06-07). That document remains the reference for the enrollment/auth architecture it built.

This is the master spec for pivoting tennisbootcamp.ca from an open-enrollment funnel to an **assessment-first funnel**:

> Book a 20-minute on-court assessment ($20 CAD, credited to your first program) → coach assigns a real level and the site holds the player's weekly availability → admin groups same-level players who share a free time slot → admin creates a **private cohort** with set dates/times → invited players pay through the existing checkout, accept the attendance/make-up terms, and the cohort confirms at minimum size.

Why this shape: self-reported levels are unreliable and one mis-rated player degrades a whole group, so the coach-assigned level becomes the placement source of truth; the assessment is also the low-friction entry product being marketed; and structured availability data turns schedule coordination (the owner's biggest operational pain) from phone tag into a query.

It is **phased**. Build one phase per PR, in order. Each phase must pass CI (lint + typecheck) and must not break the intake pipeline. Do not start a later phase before the earlier one is merged and verified. Run each phase via `npm run agent:run -- "Execute Phase N of ops/plans/assessment-restructure.md"` or an interactive Claude Code session.

---

## Owner decisions locked 2026-07-18

These were decided explicitly by Sina in the 2026-07-18 Cowork session. Do not re-open.

1. **Intake outcome:** the wizard keeps the recommendation engine but reframes its result as a *tentative match* — "you profile like a fit for X" — with the single primary next step being the assessment booking. Direct enrollment stays available as a demoted, secondary path.
2. **Primary CTA label:** **"Book Your Assessment"** (replaces "Find My Program" site-wide).
3. **Assessment booking:** self-serve slots. Admin defines assessment blocks; the site splits them into 20-minute slots; players book online.
4. **Assessment price:** **$20 CAD**, paid at booking via the existing Stripe setup, automatically credited when the player enrolls in a program.
5. **Grouping model:** layered. Phase 3 ships admin-driven private cohorts (admin reads availability data and builds each cohort). Phase 4 adds deterministic cluster suggestions ("hybrid"). Interest-driven self-filling public slots are explicitly out of scope for now.
6. **Attendance terms:** missed sessions are not refunded or credited. Sessions cancelled by the business (weather, court, coach) become make-up sessions at the same weekday/time in the week(s) appended after the final scheduled week, capped (default 2 weeks), with credit as the overflow fallback. Full policy text in Appendix B.
7. **Club membership:** the venue is a government-owned non-profit community club; membership is **$100 for the outdoor season (valid until ~November)** and the club wants everyone Sina teaches to be a member. Membership is a **pass-through**: players register and pay the club directly — never through our Stripe. Whether a 20-minute assessment can run under the club's guest provisions is **pending Sina's answer from the club** — all membership copy ships behind the toggle described in Appendix A.

---

## Non-negotiables (carry through every phase)

1. **Never break `/api/intake`.** The Google Sheets contract is frozen through col 17 (`timestamp … recommended_program`); any extension appends after col 17, never reorders or renames. Test a real intake submission before calling any phase done.
2. **Brand voice:** welcoming, serious, athletic, premium — a world-class coach, not a salesperson, not a SaaS app (see `ops/briefs/brand.md`). This applies to the assessment pages and every new email.
3. **Colors/type:** background `#061427`, lime `#B4E655`, secondary `#8CC63F`, text `rgba(255,255,255,0.92)`, Geist. No new palette.
4. **Mobile first — including every new `/admin` page.** Sina will run grouping, invites, and session cancellations from his phone at the court. Admin screens must be fully usable at 390px width with 44px touch targets.
5. **Deterministic logic only.** The recommendation engine and the Phase-4 cluster finder are rule-based. No LLM calls at runtime.
6. **Guest checkout stays.** Assessment booking and cohort enrollment must not require an account up front. Email remains the unique key; the existing auto-provision + claim flow continues to attach records to accounts.
7. **Venue naming:** venues are not confirmed partners yet (see `ops/briefs/competitors.md` flag). Assessment and cohort copy must not name a venue as a confirmed partner — location is communicated as "confirmed in your booking email."
8. **Preview mode** (`NEXT_PUBLIC_PREVIEW_MODE`) and **Stripe test keys** remain until the existing launch gates are cleared. Everything in this plan must work end-to-end in test mode.
9. **RLS discipline:** every new table gets RLS enabled in the same migration that creates it; service-role usage only from `import 'server-only'` modules, matching the existing hardening pass.

---

## Current state this plan builds on (verified 2026-07-18, HEAD `5689863`)

- Supabase Auth + Postgres live (`supabase/migrations/0001_init.sql`: `profiles`, `enrollments`, RLS, `handle_new_user`), dashboard + profile pages shipped.
- Enrollment: `/enroll/[cohortId]` wizard (summary → registrant → consent) → `/api/checkout` (Stripe test mode, mock-mode aware) → `/api/webhooks/stripe` → Sheets + Supabase dual-write, seat counting (`src/lib/seatCount.ts`), auto-provision + claim.
- Cohorts are **static content**: `src/content/cohorts.ts` typed by `src/types/cohort.ts` (`SessionSlot`, `capacityMin/Max`, `status`), read through `src/lib/cohorts.ts`.
- Intake: 5-step wizard at `src/app/intake/page.tsx` with rule-based recommendation (`src/lib/recommend.ts`), direct-enroll from the result screen (PR #33), recommendation email via Resend (`src/lib/email.ts`, verified sender `noreply@send.tennisbootcamp.ca`).
- Policy pages: `/legal/refund-policy` (7-day/50%/no-refund tiers + $25 admin fee) and `/legal/waiver` (placeholder with visible "not reviewed by legal counsel" banner).
- GA4 events wired via `src/lib/analytics.ts`; MailerLite newsletter sync; preview banner.
- **CTA swap sites** (line numbers at HEAD `5689863` — re-grep `"Find My Program"` before editing): `src/components/sections/Hero.tsx:59`, `src/components/layout/Navbar.tsx:120` and `:188`, `src/app/not-found.tsx:30`, `src/app/intake/layout.tsx:4` (metadata title).

---

## Target flows

**New player (primary):**
Home → **"Book Your Assessment"** → 5-step intake (availability step upgraded to a structured grid) → result screen: *tentative match* ("you profile like our Level 3.0 group") + primary CTA **"Book my 20-minute assessment"** → `/assessment/book` slot picker (prefilled from intake) → $20 Stripe checkout → branded confirmation email → 20 minutes on court → coach marks the booking complete with a level + note → player enters the grouping pool and gets the "your level + next step" email.

**Group formation (admin):**
`/admin` → pool of assessed players filtered by level → (Phase 4: suggested clusters) → **create private cohort** (program, level band, weekday + time, start date, weeks, price, capacity, minimum-to-run) → system emails invites with a 48-hour hold and personal enroll links → players pay through the existing checkout (their $20 assessment auto-credited) → at minimum paid count the cohort flips to confirmed and everyone gets the confirmation email → sessions run → if a session is cancelled, admin marks it in one tap and the system appends the make-up session and emails the group → cohort completes → "rebook this group" clones it (Phase 4).

**Self-directed (secondary, unchanged):**
Browse Programs → public cohort card → direct enroll. This path stays alive but visually secondary.

---

## Data model

Two migrations, one per phase that needs them. Follow `0001_init.sql` conventions (RLS in-file, SECURITY DEFINER revokes, comments).

### Migration `0002_assessments.sql` (Phase 1)

```sql
-- profiles: placement + coordination fields
alter table public.profiles
  add column role text not null default 'student' check (role in ('student','admin')),
  add column level numeric(2,1),              -- coach-assigned, NTRP-style 1.0–7.0 halves
  add column level_assessed_at timestamptz,
  add column level_notes text,                -- coach's short written note
  add column availability jsonb,              -- weekly template, see format below
  add column phone text;

create table public.assessment_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_time time not null,
  end_time time not null,
  slot_minutes int not null default 20,
  location_label text,                        -- free text; venue-naming rule applies
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.assessment_bookings (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.assessment_blocks(id),
  slot_start time not null,                   -- computed 20-min slot within the block
  name text not null,
  email text not null,                        -- unique key to the person (guest-friendly)
  phone text,
  user_id uuid references auth.users(id),     -- attached when/if account exists (by email)
  self_level text,                            -- optional self-estimate carried from intake
  availability jsonb,                         -- snapshot carried from intake at booking
  status text not null default 'pending'
    check (status in ('pending','booked','completed','no_show','cancelled','expired')),
  stripe_session_id text,
  paid boolean not null default false,
  level_result numeric(2,1),                  -- coach-assigned at completion
  coach_notes text,
  credit_status text not null default 'unused'
    check (credit_status in ('unused','applied','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz                      -- pending bookings expire ~15 min after creation
);
-- Unique partial index: one active booking per (block_id, slot_start)
-- where status in ('pending','booked') — prevents double-booking a slot.
```

**Availability JSON format** (used in `profiles.availability` and `assessment_bookings.availability`):
`{"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}` — day keys `mon…sun`, band values `mor` (before 12), `aft` (12–17), `eve` (after 17). Bands, not hours: phone-friendly to fill, coarse enough to cluster on. `v` allows a later hour-grid upgrade.

**RLS intent:** players select/update only rows matching their `auth.uid()` (or none — bookings are written server-side); admin (profiles.role = 'admin', checked via a `security definer` helper function `public.is_admin()`) gets full read/write; inserts from API routes use the service-role client in `server-only` modules, same as enrollments today.

### Migration `0003_cohorts_admin.sql` (Phase 3)

```sql
create table public.cohorts (
  id text primary key,                        -- keep string ids compatible with existing /enroll/[cohortId]
  program_id text not null,                   -- FK by convention → src/content/programs.ts ids
  label text not null,
  level_min numeric(2,1), level_max numeric(2,1),
  location_label text,
  start_date date not null,
  weeks int not null,
  sessions jsonb not null,                    -- [{day:"Tue",start:"18:00",end:"19:00"}] — mirrors SessionSlot
  price_cents int not null, currency text not null default 'CAD',
  capacity_min int not null default 3,        -- minimum-to-run
  capacity_max int not null,
  visibility text not null default 'public' check (visibility in ('public','private')),
  status text not null default 'draft'
    check (status in ('draft','inviting','confirmed','running','completed','cancelled')),
  invite_hold_hours int not null default 48,
  makeup_max_weeks int not null default 2,
  created_at timestamptz not null default now()
);

create table public.cohort_invites (
  id uuid primary key default gen_random_uuid(),
  cohort_id text not null references public.cohorts(id),
  email text not null,
  user_id uuid references auth.users(id),
  token text not null unique,                 -- random, single-use, carried on the enroll link
  status text not null default 'invited'
    check (status in ('invited','paid','declined','expired')),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null             -- invited_at + cohort.invite_hold_hours
);

create table public.cohort_sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id text not null references public.cohorts(id),
  session_date date not null,
  start_time time not null, end_time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled')),
  cancellation_reason text,
  makeup_for uuid references public.cohort_sessions(id),  -- set on appended make-up rows
  created_at timestamptz not null default now()
);
```

Cohort rows are generated into `cohort_sessions` when a cohort is confirmed (weeks × sessions/week, concrete dates). Cancelling a session appends a make-up row (same weekday/time, first free week after the current final week) and records `makeup_for` — the cap and overflow-to-credit logic live in Appendix B and `src/lib/makeup.ts`.

**Static-cohort migration:** Phase 3 seeds `public.cohorts` from `src/content/cohorts.ts` (same ids — existing `/enroll/[cohortId]` links keep working), switches `src/lib/cohorts.ts` to read from Supabase with the static file as build-time fallback, and marks the static file deprecated-for-write ("edit cohorts in /admin from now on").

**Google Sheets (Sina's ops view — additive only):**
- New tab `assessments`: `timestamp, name, email, phone, slot_date, slot_start, status, paid, level_result, coach_notes, credit_status`. Dual-written like enrollments. Tab must be created manually in the Sheet before first production booking (same rule as `newsletter`).
- Enrollment rows: append one column after the current last column: `assessment_credit` (`"20.00"` or empty). Never reorder.

---

## Phase 1 (PR) — Assessment foundation + self-serve booking

Everything ships **unlinked** from the main funnel (reachable by URL only) so it can be tested end-to-end before the funnel flips in Phase 2.

**Build:**

1. Migration `0002_assessments.sql` (above). Run in Supabase SQL editor, same manual process as 0001.
2. `/assessment` — landing page: what the assessment is, what the player leaves with, price + credit line, membership note (behind the Appendix A toggle), FAQ. Copy in Appendix A. Metadata + OG image, added to sitemap.
3. `/assessment/book` — slot picker: upcoming blocks (next ~3 weeks) split into 20-minute slots, taken slots disabled; contact form (name, email, phone, optional self-level); accepts `?prefill` handoff from intake (Phase 2) via sessionStorage.
4. `/api/assessment/book` — creates a `pending` booking with `expires_at = now() + 15 min`, then hands off to Stripe Checkout (reuse `src/lib/payments.ts` patterns; product "20-Minute Player Assessment", `ASSESSMENT_PRICE_CENTS` env, default `2000`; if `0`, skip Stripe and confirm directly — this is the free-mode toggle). Webhook path marks `booked` + `paid`, dual-writes the `assessments` Sheet tab, sends the confirmation email. Expired pendings are swept lazily (on slot-list read) back to available.
5. Minimal admin at `/admin/assessments` — gated by `profiles.role = 'admin'` (redirect to `/login` otherwise): create/edit blocks, list bookings by day, and a **complete-booking form**: level (NTRP halves 1.0–7.0), coach note (2–3 sentences), one tap for `no_show`. Completing writes `level_result`/`coach_notes` to the booking, updates the matching profile if one exists (by `user_id` or email match), updates the Sheet row, and sends the "Your level + next step" email. Phone-first layout.
6. Emails (both on the existing branded template): **booking confirmation** (date/time, what to bring, reschedule line, membership toggle line) and **assessment complete** (level, coach note, "we're forming your group — watch your inbox", link to browse programs).
7. GA events: `assessment_book_start`, `assessment_book_complete`, `assessment_completed_admin`.
8. Seed Sina's admin role: one-off SQL (`update profiles set role='admin' where …` documented in the migration comments), plus `.env.local.example` additions.

**Acceptance:** in Stripe test mode — book a slot end-to-end (pending → paid → email), double-booking a slot is impossible, expired pending frees the slot, admin completes a booking and the level lands on the booking + profile + Sheet, `$0` price skips payment cleanly, `/api/intake` untouched, CI green.

---

## Phase 2 (PR) — Funnel flip (CTA + intake reframe)

**Build:**

1. **CTA swap** at the five grep sites (Hero, Navbar ×2, 404, intake layout title) → **"Book Your Assessment"**. Hero adds one microcopy line under the button: *"20 minutes on court · $20, credited to your first program."* Update intake page metadata/OG titles to match.
2. **Availability step upgrade** inside the 5-step intake: replace the current availability input with the structured grid — 7 day columns × 3 band rows (Morning/Afternoon/Evening), tap-to-toggle, phone-first. Serialize into Sheets col 16 as a compact string (`"mon:eve;wed:mor,eve;sat:aft"`). **Inspect the current col-16 serialization first** and keep the new format self-identifying (prefix `v1:` if the current format is ambiguous) — the column contract is additive, the cell format just needs to stay parseable.
3. **Result screen reframe:** keep the recommendation engine call, present it as a tentative match — headline *"You profile like a [Level 3.0] player"*, program card with a "why this fits" line, then the assessment pitch block (copy in Appendix A). Primary CTA **"Book my 20-minute assessment"** → `/assessment/book` carrying name/email/phone + availability via sessionStorage. Direct-enroll (PR #33 behaviour) demoted to a text link: *"Know what you want? Enroll directly →"*.
4. **Recommendation email** updated: same tentative-match framing, primary button to `/assessment/book`.
5. Homepage `TrustBar`/hero badge copy: no structural change; if the "Spring Intake is Live" badge is stale, swap text to "Assessments Now Open" (copy-only change).
6. GA events: `assessment_cta_click` (hero/navbar/intake-result distinguished by a `source` param).

**Acceptance:** real intake submission writes an identical-shape row (cols 1–17 intact, col 16 in the new-but-parseable format), tentative-match screen renders for every recommendation branch, handoff prefills the booking form, direct-enroll still completes, mobile pass at 390px, CI green.

---

## Phase 3 (PR) — Admin core + private cohorts + invites

**Build:**

1. Migration `0003_cohorts_admin.sql` (above) + seed from `src/content/cohorts.ts` + `src/lib/cohorts.ts` reads Supabase (static fallback at build time).
2. `/admin` home — three cards: Assessments (Phase 1 page), Players, Cohorts.
3. `/admin/players` — assessed-player pool: filter by level band, sort by assessed date; each row shows level, availability chips (Mon-eve style), contact; tap into detail (edit level/notes/availability — coach corrections happen).
4. `/admin/cohorts` — list + create/edit. Create form: program, label, level band, weekday+time session slots, start date, weeks, price, capacity min/max, visibility (default `private`), hold hours, makeup cap. **Season-end guard:** warn (not block) when `end date + makeup_max_weeks` passes `SEASON_END_DATE` (env, default `2026-11-30`): *"Make-ups could run past the outdoor season — consider an earlier start."*
5. **Invite flow:** from a cohort in `draft`, pick players from the pool (Phase 4 prefills this) or add by email → status `inviting` → each invitee gets a branded email with a personal link `/enroll/[cohortId]?invite=TOKEN` and the 48-hour hold messaging. `/enroll/[cohortId]`: private cohorts require a valid unexpired token (invalid/expired → friendly "this invitation has expired — reply to get back in" page); public cohorts unchanged.
6. **Credit application:** during checkout for any cohort, server looks up a `completed`+`paid` assessment booking by enrollee email with `credit_status='unused'` and applies a $20 discount to the Stripe session (Checkout discount; in mock mode just subtract). Webhook success marks `credit_status='applied'` and writes the `assessment_credit` Sheets column.
7. **Confirmation logic:** webhook marks the invite `paid`; when paid count reaches `capacity_min`, cohort flips to `confirmed`, `cohort_sessions` rows are generated, and all paid members get the confirmed email (schedule list included). Expired invites flip to `expired` on read; admin can re-invite or invite the next candidate manually (no auto-waitlist in this phase).
8. **Session cancellation + make-ups:** `/admin/cohorts/[id]` shows the session list; cancelling one (reason picker: weather / court / coach / other) appends the make-up row per the Appendix B rules (`src/lib/makeup.ts`, pure + unit-testable logic) and sends the cancellation/make-up email to all members. Over-cap cancellations mark the session `cancelled` with no make-up row and flag the cohort for credit follow-up (admin banner).
9. **Student dashboard:** enrolled cohort card gains the full session list including make-ups (make-ups badged "Make-up · replaces Jul 30").
10. GA events: `cohort_invite_sent`, `cohort_invite_paid`, `cohort_confirmed`.

**Acceptance:** create private cohort → invite two test emails → pay both in test mode ($20 credit applied to one with a completed assessment) → cohort auto-confirms → sessions generated → cancel one session → make-up appended + emails sent → dashboard shows it; expired token blocks enrollment; public cohort flow unchanged; RLS verified (student cannot read another student's rows, non-admin cannot reach `/admin`); CI green.

---

## Phase 4 (PR) — Cluster suggestions + group rebooking

**Build:**

1. `src/lib/grouping.ts` — deterministic, unit-tested: for each level band (players within ±0.5 of each other) × each (day, band) slot, collect assessed players whose availability covers it and who aren't in an active cohort clashing with it; emit clusters with `count >= capacity_min` (use the smallest program min as default), sorted by count desc then most-recently-assessed.
2. `/admin` "Suggested groups" cards — *"Tue evening · Level 3.0–3.5 · 5 players"* → tap → prefilled cohort-create form with those players pre-selected as invitees.
3. **Rebook this group:** on a `completed` cohort, one tap clones it (start date = next Monday + configurable offset, same slots/price/members) into `draft` with all previous members pre-selected, invite emails use rebooking copy (*"your membership's already covered — jump back in"* if within the same season).
4. GA events: `cluster_suggested_used`, `cohort_rebooked`.

**Acceptance:** synthetic pool of 12 fake players across 3 levels yields correct clusters (unit tests, fixed fixtures); suggestion → created cohort in under a minute of taps on mobile; rebook produces a correct clone; CI green.

---

## Phase 5 (PR — small, can ship in parallel with Phase 3) — Policies + consent

**Build:**

1. `/legal/refund-policy` → retitle **"Program Policies"** (keep the URL; add redirect only if renaming the route). Keep the existing pre-start withdrawal tiers **unchanged**; add the new sections verbatim from Appendix B (attendance, cancelled sessions & make-ups, program cancellation by us, assessments, club membership).
2. **Enroll wizard consent step:** replace the generic checkbox with the three itemized checkboxes from Appendix B. Consent text stored with the enrollment (Supabase + Sheets additive col if not already captured).
3. **Assessment booking page:** one short terms line + link (Appendix B, "Assessments" clause).
4. Waiver page: unchanged, keeps its "not reviewed by legal counsel" banner. **This whole policy set needs a lawyer's once-over before live keys — already a launch gate.**

**Acceptance:** policy page renders both old and new sections; consent checkboxes required to proceed; consent recorded; CI green.

---

## Appendix A — Copy deck

Exact strings. Adjust rhythm to fit components, not meaning. Brand voice throughout: coach, not salesperson.

**Primary CTA (hero, navbar, 404, intake title):** `Book Your Assessment`
**Hero microcopy (under CTA):** `20 minutes on court · $20, credited to your first program`

**Intake result screen (tentative match):**
- Headline: `You profile like a Level {level} player`
- Body: `Based on your answers, {Program} looks like your fit. Every player here is placed by an on-court assessment — 20 minutes with the coach — so the group you train with actually matches your level.`
- Primary CTA: `Book my 20-minute assessment`
- Secondary link: `Know what you want? Enroll directly →`

**/assessment landing:**
- H1: `Every player starts with 20 minutes on court.`
- Lede: `No group here is a lucky draw. Before you join a program, you hit with the coach — a short rally, groundstrokes under a little pressure, a few serves. You leave with a real level, a written note on your game, and a group recommendation that matches both your level and your schedule.`
- Price block: `$20 · fully credited to your first program` + support line `Book, play, and if you join a program the assessment was free.`
- What-you-leave-with bullets: `Your level, assigned by the coach` / `A short written read on your game` / `A group recommendation matched to your level and your weekly availability`
- FAQ seeds: what to bring (racquet if you have one, water, court shoes); weather (`If weather cancels your slot, you rebook free — no charge lost.`); kids (parent/guardian books and attends); how groups form (short version of the funnel).

**Membership toggle** — `NEXT_PUBLIC_CLUB_GUEST_OK` env, referenced wherever membership is mentioned (landing FAQ, booking confirmation email, program pages):
- Variant A (`true` — guests allowed for assessments): `No membership needed for your assessment. When you join a program, the club asks for a season membership — $100 until November, paid directly to the club — which also gives you court access all season.`
- Variant B (`false` — members only, even for assessments): `The club hosting us asks that every player on court holds a season membership — $100 until November, paid directly to the club. It covers your assessment, your program, and open court access all season.`
- Until Sina confirms: ship with Variant A copy **hidden** behind the flag default `unset` → show the neutral line `Court details and any club requirements are confirmed in your booking email.`

**Emails** (existing branded template; FROM `Tennis Bootcamp <noreply@send.tennisbootcamp.ca>`):
- Booking confirmation — subject `You're booked: {date} at {time}`; body: slot details, what to bring, `Need to move it? One free reschedule with 24 hours' notice — just reply to this email.`, membership toggle line, location line per venue-naming rule.
- Assessment complete — subject `Your level: {level} — here's your next step`; body: coach note verbatim, `We're forming your {level} group around everyone's availability — invitations go out by email. Want to move sooner?` + browse-programs button.
- Cohort invite — subject `Your Level {level} group is forming — {day}s {time}, starts {date}`; body: schedule, venue line, price with credit applied shown as math (`$649 − $20 assessment credit = $629`), `Your spot is held for 48 hours.`, terms link, pay button.
- Cohort confirmed — subject `You're in: {label} starts {date}`; body: full session list, what to bring, policies link.
- Session cancelled — subject `{date}'s session is cancelled — your make-up is set`; body: reason in one plain sentence, `Make-up: {new_date}, same time. Your cohort now ends {new_end_date}.`, policies link.

---

## Appendix B — Policy text (Program Policies page + consent)

> **Not legal advice.** This draft encodes the owner's decided rules in plain language. A lawyer must review before Stripe live keys are set (existing launch gate). Bracketed values are config defaults — change in one place (`src/content/policies.ts`).

**Attendance (add to /legal/refund-policy, after the existing withdrawal tiers):**

> **Missed sessions.** Group sessions run on the published schedule whether or not every player attends. A session you miss is not refunded, credited, or rescheduled — your group trains on.
>
> **Sessions we cancel.** If we cancel a session — weather, court availability, coach illness, or any other reason on our side — you don't lose it. Every cancelled session becomes a make-up session at the same day and time, in the week immediately following your cohort's final scheduled week. Multiple cancellations queue up in the order they were missed. If a make-up session is itself cancelled, the same rule applies again.
>
> **Limits.** Make-ups extend a cohort by at most [2] weeks. If cancellations ever exceed that, the remaining sessions convert to a credit toward your next program, prorated per session. If the usual court or time isn't available for a make-up, we'll schedule the closest comparable alternative and tell you at least [48 hours] ahead.
>
> **Notice.** Cancellation notices go out by email no later than [2 hours] before start time.
>
> **If we cancel a program.** If a program is cancelled outright by us — including not reaching minimum enrollment before start — you choose: full refund or full credit.
>
> **Assessments.** The assessment fee ($20) is credited automatically when you enroll in a program within [6 months]. It isn't refunded if you miss your slot; you get one free reschedule with [24 hours'] notice.
>
> **Club membership.** Programs run at a community club that requires its own season membership ($100, valid until November, paid directly to the club). It isn't part of our fees and isn't ours to refund.

**Consent step (enroll wizard) — three required checkboxes:**

1. `I've read and agree to the Program Policies, including that sessions I miss are not refunded or credited.`
2. `I understand that sessions cancelled by Tennis Bootcamp become make-up sessions at the same day and time in the week(s) after the final scheduled week — up to [2] added weeks, then credit.`
3. `I agree to the Liability Waiver` + conditional: `I am the parent/guardian of the registrant and consent on their behalf` when registrant age < 18.

---

## Appendix C — Owner inputs needed (blocking noted per phase)

| Input | Blocks | Default until answered |
|---|---|---|
| Club's answer on assessment guest provision | Final membership copy (A/B toggle) — Phase 1 ships neutral line | Neutral line |
| Assessment block schedule (days/times Sina will hold) | First real bookings, not the build | — |
| Confirm config: $20 price, 6-mo credit window, 48h hold, 2-week make-up cap, 2h notice, Nov 30 season end | Phase 5 final copy | Defaults as bracketed |
| Level display bands (NTRP halves proposed: 1.0–7.0) | Phase 1 admin form labels | NTRP halves |
| Winter plan (indoor venue or season stop) | Nothing now — flag in OPEN_QUESTIONS | Season stop |
| Lawyer review of Appendix B + waiver | Stripe live keys (existing gate) | Placeholder banners stay |

## Appendix D — Explicitly out of scope (this plan)

- Interest-driven public slot posting (grouping layer C) — revisit after Phase 4 proves out.
- SMS notifications — email only; wording avoids promising SMS.
- Membership payment/verification through our stack — always pass-through to the club.
- Winter/indoor season modeling; multi-venue logic beyond a free-text location label.
- Figma redesign work; newsletter/CRM changes; video lessons.

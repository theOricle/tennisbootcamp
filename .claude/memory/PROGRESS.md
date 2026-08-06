# Progress — Living Status

_Update this at the start or end of each working session._

---

## Current State (2026-05-31)

### Shipped & Merged to Main

- [x] Hero: particle-wave Three.js background, Spring Intake badge, brand copy, "Find My Program" + "Browse Programs" CTAs
- [x] TrustBar, EmailCapture → `/api/newsletter` → Google Sheets "newsletter" tab
- [x] ProgramsGrid, Coaches (Sina only), EventsList (empty state), LocationsGrid (Maps links)
- [x] `/api/intake` → Google Sheets, 17 cols, priority scoring, lead_type, recommended_program
- [x] Sub-pages: Programs, Events, Locations, Video Lessons (clean coming-soon), About
- [x] SEO: robots.ts, sitemap.ts, opengraph-image.tsx, per-page metadata on all routes
- [x] Geist font, GA4 via @next/third-parties, GitHub Actions CI
- [x] **Phase 0+1 (PR #2):** Cohort data model, `/programs/[slug]` detail pages, cohort cards, grid schedule reveal
- [x] **Phase 2 (PR #3):** Intake recommendation engine — 6-step wizard, rule-based program scoring, `/api/program-interest`
- [x] **Phase 3 (PR #4):** "Find My Program" primary CTA + "Browse Programs" secondary on home + Navbar
- [x] **Phase 4 (PR #5):** `/enroll/[cohortId]` 3-step wizard (summary → registrant → consent), `/api/enroll` → Google Sheets
- [x] **Phase 5 (PR #6):** Stripe Checkout (keys-optional mock mode), `/api/checkout`, `/api/webhooks/stripe`, seat counting, `/legal/waiver`, `/legal/refund-policy`, `/enroll/[cohortId]/confirmed`
- [x] **fix/seatcount-failsafe (PR #7):** `getSeatsRemaining` wrapped in try/catch, returns null on any error
- [x] **fix/hardening-and-nav (PR #8):** Mobile nav drawer wired (hamburger + outside-click close), SEO title dedup on 5 pages

### Open PRs (not yet merged)

- [ ] **PR #9** — `feat/supabase-accounts-dashboard` — Phase 6: Supabase Auth + dashboard (conflict-resolved, includes main)
- [ ] **PR #10** — `fix/auth-callback-token-hash` — Fixes activation link to use `token_hash` + `verifyOtp` instead of legacy `action_link` hash flow

### Phase 6 — What Was Built (PRs #9 + #10)

- `src/lib/supabase/` — `server.ts`, `browser.ts`, `service.ts` (import 'server-only'), `enrollmentActions.ts`
- `src/middleware.ts` — session refresh on every request
- `supabase/migrations/0001_init.sql` — profiles + enrollments + RLS policies + handle_new_user trigger (run manually in Supabase SQL editor)
- Auth UI: `/login`, `/auth/callback`, `/auth/forgot-password`, `/set-password`
- `/dashboard` — server component, redirects to /login if no session, shows enrollments
- Navbar — auth-aware: Dashboard + Sign-out when signed in; hamburger drawer wired
- `/api/checkout` — dual-writes Sheets + Supabase; stubs invite in mock mode
- `/api/webhooks/stripe` — updates Supabase status to paid + issues activation link
- Activation link stub: `console.log` with `[STUB EMAIL — Phase 7 will replace with Resend]` prefix
- `token_hash` + `verifyOtp` pattern in `/auth/callback` (PR #10 fix)

### Waiting on Owner (to activate Phase 6)

- [ ] Add to Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`
- [ ] Run `supabase/migrations/0001_init.sql` in Supabase SQL editor
- [ ] Merge PR #9 then PR #10

### Still Waiting on Owner (general)

- [ ] Real social media URLs → `src/content/site.ts`
- [ ] Calendly URL → `bookingHref` in `src/content/site.ts`
- [ ] Real second coach → `src/content/coaches.ts`
- [ ] Real event dates → `src/content/events.ts` (remove `placeholder: true`)
- [ ] Custom domain `tennisbootcamp.ca` → Vercel dashboard; update `BASE_URL` in `robots.ts` + `sitemap.ts`
- [ ] GA4 measurement ID → `NEXT_PUBLIC_GA_ID` in Vercel
- [ ] `program_interest` tab created manually in Google Sheet

### Not Yet Built

- [ ] **Phase 7:** Resend transactional email — replace `console.log` stubs in `issueActivationLink()`
- [ ] Real second coach, real social URLs, real event data
- [ ] Video lessons content + gated access
- [ ] Maps embedded on locations page
- [ ] Testing infrastructure

---

## Session Log

### 2026-04-19 to 2026-05-08 (sessions 1–4)
See archived entries in git history. Summary: full site scaffold, hero, intake, SEO, GA4, CI, brand colors, Geist font, newsletter API, EventsList empty state, LocationsGrid Maps links.

### 2026-05-22 to 2026-05-24 (Phase 5 session)
- Phase 0–4 already complete (PRs #2–#5)
- Phase 5 built: Stripe Checkout keys-optional mock, seat counting, payment flow, legal pages
- fix/seatcount-failsafe (PR #7) and fix/hardening-and-nav (PR #8) shipped
- PR #8 includes wired hamburger mobile drawer + SEO title dedup

### 2026-05-29 to 2026-05-31 (Phase 6 session)
- Phase 6 built on `feat/supabase-accounts-dashboard` (PR #9)
- Auth pivot: Supabase Auth + Postgres replaces Auth.js + Neon plan (see DECISIONS.md)
- Phase 6 conflict-resolved with main (merge commit ce47134)
- PR #10 (`fix/auth-callback-token-hash`) — token_hash + verifyOtp pattern
- Both PRs open, awaiting Sina's merge + Supabase env var setup

### 2026-07-18 (Cowork planning session — product pivot)

- **Assessment-first restructure decided and spec'd.** Funnel: "Book Your Assessment" ($20, 20 min, credited to first program) → coach-assigned level + structured availability grid → admin-built private cohorts (invites, 48h hold, minimum-to-run) → attendance & make-up terms at checkout. Four new DECISIONS.md entries (2026-07-18).
- **New active build plan: `ops/plans/assessment-restructure.md`** (5 phases, one PR each) — supersedes `enrollment-and-accounts.md`, whose phases had all shipped by 2026-06-07 per root CLAUDE.md. (Note: the "Current State" section at the top of this file predates that and is stale.)
- Club facts confirmed: government-owned non-profit community club; $100/season membership valid to ~November; pass-through — players pay the club directly. Assessment guest provision pending Sina's check (new OPEN_QUESTIONS entry).
- Root CLAUDE.md updated: active-plan pointer, pivot in locked decisions, club facts.
- **Next:** owner skims the spec (especially Appendix B policy text + Appendix C inputs), then execute Phase 1 via Claude Code: `npm run agent:run -- "Execute Phase 1 of ops/plans/assessment-restructure.md"`.

### 2026-07-21 (Claude Code — Phase 2: funnel flip)

Executed **Phase 2** of `ops/plans/assessment-restructure.md` on branch `feat/assessment-phase-2` (Phase 1 / PR #38 already merged). The funnel now leads with the assessment.

- **CTA swap (5 sites):** "Find My Program" → **"Book Your Assessment"** in Hero, Navbar (desktop + mobile), 404, and the intake `<layout>` metadata title (+ OG title/description). All still link to `/intake` — the wizard is the entry point and its result screen routes on to `/assessment/book`.
- **Hero:** eyebrow badge "Now Enrolling" → **"Assessments Now Open"**; sub-CTA microcopy → *"20 minutes on court · $20, credited to your first program."*
- **Availability step upgrade:** replaced the 4-checkbox availability question with a structured **days × bands grid** (7 days × Morning/Afternoon/Evening, tap-to-toggle, one row per day, 44px targets, 390px-safe), backed by Phase 1's `Availability` (`{days,v:1}`) model.
- **`/api/intake` col-16 (frozen contract respected):** the `availability` column stays column 16; only the **cell format** is upgraded. New clients send the structured grid object; the API serializes it to a compact, self-identifying string `v1:mon:eve;wed:mor,eve;sat:aft` (`availabilityToCompactString`). Legacy array submissions still serialize the old comma-joined way. Cols 1–17 unchanged, range still `A:Q`. The rule-based recommender is untouched — it consumes legacy slots derived from the grid via `availabilityToLegacySlots` (new pure helpers in `src/lib/availability.ts`).
- **Result screen reframe:** `TentativeMatchScreen` replaces the old "Priority Placement List" — headline *"You profile like a Level {band} player"* (deterministic band from `src/lib/level.ts`), a program card with the "why this fits" reason, the assessment pitch block, and the primary CTA **"Book my 20-minute assessment"** which writes the `assessmentPrefill` sessionStorage handoff (name/email/phone/selfLevel/availability) and routes to `/assessment/book`. Direct enrollment is demoted to a text link *"Know what you want? Enroll directly →"* (top open cohort, else program page). The empty-recommendation fallback also leads with the assessment.
- **Recommendation email:** `sendRecommendationEmail` reframed to the same tentative-match copy with a primary button to `/assessment/book`.
- **GA:** new `assessment_cta_click` event with a `source` param (`hero` / `navbar` / `intake-result`).
- **Verified:** `tsc --noEmit`, `npm run lint`, and `npm run build` all clean; `/api/intake` column contract untouched (17 cols, additive cell-format change only).

### 2026-07-23 (Claude Code — Phase 2.5: tier identity layer)

Executed **Phase 2.5** of `ops/plans/assessment-restructure.md` (new section, spec'd + built this session) on branch `claude/tier-identity-layer-r51nx0`. A pure **display layer** over the numeric level — **zero contract changes**: no migration, no new columns, `/api/intake`/enrollment/cohort logic untouched.

- **Spec:** appended **"Phase 2.5 — Tier identity layer"** after Phase 2 in the plan, and amended Phase 3 with the four tier-display bullets (cohort cards + invite emails show tier-range badges; dashboard "Open for your tier"; `/enroll` level-within-range for tier-gated cohorts alongside the token path; admin cohort form stays numeric).
- **`src/lib/tiers.ts`:** the seven tiers (1 Love · 2 Rally · 3 Deuce · 4 Break · 5 Ace · 6 Match Point · 7 Grand Slam), each spanning one whole level. `tierForLevel` floors to the whole tier (2.5 → Rally) and clamps 1–7, returning `null` when unranked; `formatTierLevel` → `"Rally · 2.5"` so half steps read as progress within a tier. Pure, no JSX, no DB; coerces Postgres numeric strings.
- **`src/components/tiers/`:** seven brand SVG badge components (`LoveBadge`…`GrandSlamBadge`) — one consistent hexagon field (`#061427`) ringed in lime (`#B4E655`) with white/lime motifs escalating up the ladder (ball → volleying arcs → balanced balls → broken line → star → crown → trophy+laurel); crisp at 20px and 64px; each `role="img"` + `aria-label`. Plus `TierBadge` (badge + name + numeric level), `UnrankedChip` (→ `/assessment/book`, 44px target), `TierStatus` (badge-or-chip header helper), `TierChip` (dense rows), and `TierLadder` (horizontal, all seven).
- **Surfaces (display only):** profile page top-right + dashboard header both use `TierStatus` (badge when a level is set, "Unranked — book your assessment" chip otherwise; queries now select `level`); admin booking rows show a `TierChip` beside the numeric level; the assessment-complete email adds a *"You're a {Tier}"* line (HTML + text, renders only when a tier resolves); `/assessment` gains a compact ladder strip.
- **Verified:** `npm run lint`, `tsc --noEmit`, and `npm run build` all clean; badges rendered + screenshotted at 20px/64px to confirm geometry; no data-contract touched.

### 2026-07-23 (Claude Code — Phase 2.6: friction pass — direct booking + request-a-time)

Executed **Phase 2.6** of `ops/plans/assessment-restructure.md` (new section, spec'd + built this session) on branch `claude/phase-2-6-friction-pass-5p0scd`. Goal: remove friction between landing and booking. Zero changes to `/api/intake` (17-col contract untouched), enrollment, or cohort logic.

- **Spec:** appended **"Phase 2.6 — Friction pass: direct booking + request-a-time"** after Phase 2.5 in the plan.
- **Direct booking CTAs:** Hero, Navbar (desktop + mobile), and 404 primary CTAs now link straight to `/assessment/book` (labels + GA `assessment_cta_click` tracking unchanged). `/assessment/book` gained a low-key *"Not sure where you stand? Take the 2-minute quiz first"* line linking to `/intake`; the quiz stays as-is as the optional level-finder/lead-capture path (its result screen already hands off to booking).
- **Migration `0003_assessment_requests.sql`** (run manually in Supabase SQL editor, like 0001/0002): adds `requested` to the `assessment_bookings` status enum, drops NOT NULL on `block_id`/`slot_start` with a check keeping them required for every other status, adds `request_note text`. RLS unchanged; the active-slot unique index is untouched (requested rows never hold a slot).
- **Request-a-time path:** with zero open slots `/assessment/book` renders a coordinate-directly form (name, email, phone, self level, shared `AvailabilityGrid` for preferred times, optional note) instead of a dead end; with slots it's behind a secondary link *"Prefer to coordinate directly? Request a time instead"*. Submitting posts `mode: "request"` to `/api/assessment/book` → `createRequestedBooking` (status `requested`, availability snapshot, no slot, no payment; copy: *"No payment now — we'll confirm your time first. The $20 is still credited to your first program."*). Two branded emails: request-received to the prospect (reach-out within a day) and a notification to info@tennisbootcamp.ca with details + preferred-time chips (log-only stubs without `RESEND_API_KEY`). New GA event `assessment_request_submit` (`source`: `no-slots` / `prefer-direct`).
- **`AvailabilityGrid` extracted** from the intake page into `src/components/ui/AvailabilityGrid.tsx`, shared by intake step 4 and the request form (intake behaviour unchanged).
- **Admin:** `/admin/assessments` gained a **Requests** section (contact, self level, availability chips, note) with **Assign a slot** (select from open slots → flips to `booked`, Sheet row + confirmation email — slot conflicts still caught by the unique index) and **Record a time** (manually coordinated date + time → internal one-slot block marked `coordinated-direct`, hidden from the public grid and the admin blocks list → `booked` on the normal rails), plus a **mark-paid toggle** (also on unpaid booked rows) for at-court/e-transfer money — mirrored to the Sheet's `paid` column. The existing complete-with-level flow applies from there. New admin API `/api/assessment/admin/requests` (GET list / POST assign·schedule·set_paid).
- **Verified:** `npm run lint`, `tsc --noEmit`, `npm run build` all clean; booking page screenshotted at 390px in the zero-slots state (request form, 44px targets); Playwright interaction test confirmed the request form gates on name+email+≥1 time band and posts the exact `mode:"request"` payload. Full DB round-trip (row + emails + admin assign/schedule) needs migration 0003 applied — test in Supabase after merge.
- **Follow-up (same PR, merged #41):** intake quiz auto-advance — single-choice steps advance on tap after a ~180ms selected-state flash (Next removed there, Back only, hidden on step 1); Back cancels a pending advance and back-then-change re-advances; multi/availability/contact steps keep their buttons and Enter-to-advance is unchanged. Playwright E2E at 390px confirmed the flow and an identical `/api/intake` payload.

### 2026-08-02 (Claude Code — funnel copy clarity + assessment account activation)

Owner-feedback pass on branch `claude/phase-2-6-friction-pass-5p0scd` (restarted from main after #41 merged). No schema changes, RLS untouched, `/api/intake` untouched.

- **Hero subhead:** "Real reps. Real progress." (read as unclear) → *"A system that makes progress inevitable."* — first and last sentences unchanged.
- **$20 credit copy:** every "credited to your first program" phrasing replaced with the explicit mechanic — the assessment costs $20, and if you enroll in a program or lesson afterward that $20 comes off the price. Long surfaces spell out the conditional in full; short surfaces (hero microcopy *"$20 — join a program after and it comes off the price"*, meta/OG descriptions) are tighter but never a bare "credited". Touched: Hero microcopy, `/assessment` price block + support line, `/assessment` + `/intake` layout metadata (both descriptions + OG), booking page heading sub + both request-form copies, both intake result screens (tentative match + fallback), and all four spots in `email.ts` (recommendation + request-received, HTML and text). `grep "credited to your first program" src/` → zero hits.
- **Assessment account activation:** `issueActivationLink` (invite for new users / magiclink for existing, "Set your password for Tennis Bootcamp" via `sendLinkEmail`) now also fires — non-blocking with `.catch` logging — from `createRequestedBooking` (at request time) and `confirmBooking` (on the pending→booked transition, so duplicate webhooks can't re-send). The request→admin-assign path (`finalizeScheduledRequest`) deliberately does not send it again, and `confirmBooking` never touches requested rows — exactly once per journey. Enrollment/checkout path unchanged.
- **Verified:** lint + typecheck + build green; dev-mode request against a local mock Supabase (REST insert + `generate_link`) logged all three stubs in order — request-received, info@ notification, and the set-password activation email.

### 2026-08-02 (Claude Code — editorial voice pass)

Copy-only editorial engagement on branch `claude/tennis-bootcamp-voice-pass-fr1dnn` (PR: `copy(site): editorial voice pass`). String literals only — zero logic, markup, or className changes; `/api/intake` untouched.

- **New `ops/briefs/voice.md`:** operational voice profile — world-class coach speaking plainly (welcoming, serious, athletic, premium); no salesperson hype, no SaaS-speak, no filler intensifiers, concrete over clever, mechanics always explicit. Encodes the owner's 2026-08-02 corrections ("real" is superfluous filler; the $20 mechanic must be spelled out) plus 14 before→after pairs from the actual site and a locked-strings list. Every future writing task loads this file — voice profile beats model choice.
- **Editorial pass** across all user-facing strings: root + home metadata (dropped "Limited spots" scarcity and the stale intake-priority funnel; fixed "North York" → Midtown, also in the locations meta), TrustBar third card reframed to assessment placement, testimonials footnote de-"real"-ed, group-lessons card description made concrete, events/video-lessons empty states ("drop your email" → plain commitments), intake quiz (kicker "PRIORITY PLACEMENT INTAKE" → "THE 2-MINUTE QUIZ", "tennis journey" → "Where's your game right now?", newsletter opt-in label made concrete ×3), assessment FAQ weather answer now says where the $20 sits, booking empty state de-pep-talked, dashboard "Camps near you" → "Where we train" + exclamation removed, programs intro tied to assessment, program-interest line aligned with the form's success copy, navbar secondary unified to "Browse Programs", emails ("Action required" → "One quick step", empty-flattery fallback replaced, "enrol" → "enroll").
- **CLAUDE.md:** appended "Model assignments (2026-08-02)" section.
- **Kept verbatim:** all prices, the explicit $20-comes-off-the-price mechanic + enrollment condition, refund numbers, "Built for athletes who want to compete.", preview-banner text, legal/waiver text, membership.ts club copy.
- **Verified:** lint + typecheck + build green.

### 2026-08-04 (Claude Code — language audit fixes)

Follow-up editorial pass on branch `claude/tennis-bootcamp-voice-pass-fr1dnn` (restarted from main after #43 merged). PR: `copy(site): language audit fixes — all-levels About, jargon budget, Kids' apostrophe`. String literals only; `/api/intake` and all behavior untouched. Owner rulings applied:

- **Grammar:** "Kid's Summer Camp" → **"Kids' Summer Camp"** (programs.ts title + cohorts.ts section comment; all other surfaces render the title dynamically).
- **All-levels positioning (About):** hero paragraph reframed from competitive-only to serious-at-every-level (with the first-use cohort definition — *a fixed group that trains together for six weeks*); the "High-performance, not recreational" card became **"Serious at every level"** — Love through Grand Slam, everyone starts with the $20 assessment, Bootcamps stays the explicitly competitive tier — and the "there are better programs out there" send-away line is gone; About metadata updated to match. Fragments kept (owner ruling).
- **Jargon budget:** Bootcamps keeps tournament dialect; all-levels surfaces translated — live-ball → realistic rally play (About, Group Lessons ×2, recommend.ts reason), "Live-ball rally tolerance" → "Staying steady through long points", "S&C block" → "strength-and-conditioning session", "Benchmarked" → "Measured at the start and end", "physical(-)literacy" → "movement" (×2).
- **Light pass:** thinned every user-facing two-em-dash sentence (About founder pillars, intake tentative-match + fallback screens, assessment + intake layout meta descriptions, recommendation email HTML + text — also dropping an "actually" filler); dropped "you'll feel the difference" closers (programs.ts, recommend.ts).
- **voice.md:** appended "Positioning ruling: all levels welcome (2026-08-04)" and "Jargon budget (2026-08-04)" sections; bumped Last updated.
- **Verified:** lint + typecheck + build green.

### 2026-08-06 (Claude Code — Phase 3: admin core + private cohorts + invites)

Executed **Phase 3** of `ops/plans/assessment-restructure.md` end to end on branch `claude/phase-3-cohorts-brjery`, including the four tier-display bullets appended by Phase 2.5. Zero changes to `/api/intake` (verified: no diff under `src/app/api/intake/`).

- **Migration `0004_cohorts_admin.sql`** (Phase 2.6 consumed 0003, so the plan's "0003_cohorts_admin" ships as 0004 — plan text amended): `cohorts` (string ids compatible with `/enroll/[cohortId]`, level band, sessions jsonb, visibility, lifecycle status, invite hold, make-up cap, `credit_followup`), `cohort_invites` (unique single-use tokens, expiring holds), `cohort_sessions` (dated rows, `makeup_for`, unique (cohort, date, start)). RLS enabled in-file on all three: authenticated read on cohorts/sessions (no PII), invites self-read only, admin-all via `is_admin()`, all writes via service-role server modules. Seeds the 5 static cohorts (`open`→`confirmed`, `upcoming`→`draft`) with `on conflict do nothing`. **Run manually in the Supabase SQL editor before exercising the new flows** — until then the site serves the static fallback and `/admin/cohorts` shows a run-the-migration notice.
- **Data layer:** `src/lib/cohortsDb.ts` (server-only) reads Supabase with the static file as fallback (unconfigured/build/table-missing); `Cohort` type extended (levelMin/Max, visibility, dbStatus, holds, caps); `src/content/cohorts.ts` marked deprecated-for-write; program pages, ProgramsGrid, profile, dashboard, enroll, confirmed all switched over. `src/lib/recommend.ts` deliberately stays on the static file (client-side deterministic engine).
- **`src/lib/makeup.ts`** — pure Appendix B logic: session generation (weeks × weekly slots), make-up planning (same weekday/time, first free week after the final scheduled week, queued in order, recursive on re-cancellation, capped at `makeup_max_weeks` then credit), current-end derivation. Checked by `npx tsx src/scripts/test-makeup.ts` (8 assertions, all passing).
- **Admin (mobile-first, 390px/44px):** `/admin` home (three cards), `/admin/players` (assessed pool: tier-band filter chips, availability chips, tap-in edit of level/note/availability via shared `AvailabilityGrid`), `/admin/cohorts` (list + create form — **numeric** level min/max per the tier rules, weekly slot rows, price/capacity/visibility/hold/make-up cap, season-end **warn** vs `SEASON_END_DATE` env default 2026-11-30), `/admin/cohorts/[id]` (status controls, invite queue with statuses + add-by-email, session list with reason-picker cancellation, credit-follow-up banner). New APIs under `/api/admin/*`, all gated by `getAdminUser()`.
- **Invite flow:** `createInvites` → tokened `/enroll/[cohortId]?invite=TOKEN` links, branded invite email with tier chips + price math (`$649 − $20 assessment credit = $629` when the invitee holds an unused credit), 48h hold; expire-on-read; draft→inviting flip. `/enroll/[cohortId]`: private cohorts admit a valid token **or** a signed-in player whose `profiles.level` ∈ [level_min, level_max]; invalid/expired token → friendly "invitation has expired" page; public cohorts unchanged.
- **Credit application:** checkout looks up a completed+paid+unused assessment booking by enrollee email, applies $20 as a Stripe Checkout coupon (subtracted in mock mode); webhook/mock path marks `credit_status='applied'`, mirrors the assessments tab, and writes the **additive** `assessment_credit` column (Q) on the enrollments tab.
- **Confirmation:** webhook marks the invite paid; at `capacity_min` paid invites the cohort flips to `confirmed` (guarded update), `cohort_sessions` are generated (also lazily for seeded confirmed cohorts on first admin open), and every member gets the confirmed email with the full session list.
- **Cancellation → make-ups:** one-tap cancel with reason (weather/court/coach/other) appends the make-up row per `makeup.ts` and emails all members (`{date}'s session is cancelled — your make-up is set`); over-cap sets `credit_followup` and sends the credit variant.
- **Tier display (Phase 2.5 bullets):** `TierRangeBadges` on program-page cohort cards, enroll summary, admin list/detail, dashboard; invite email shows tier chips; dashboard adds **"Open for your tier"** (open cohorts whose tier band contains the player's tier, minus already-enrolled); admin form stays numeric.
- **Student dashboard:** enrolled cards show the full dated session list once generated (make-ups badged "Make-up · replaces {date}"), weekly-slots summary as fallback.
- **GA:** `cohort_invite_sent` (admin client), `cohort_invite_paid` + `cohort_confirmed` (confirmed page, invite flow).
- **Verified:** `tsc --noEmit`, `npm run lint`, `npm run build` all clean; make-up script test green; built-app smoke test — public pages 200 on static fallback, `/admin*` 307 → `/login` unauthenticated; `/api/intake` zero diff. Full DB round-trip (invite → pay ×2 → auto-confirm → cancel → make-up) needs migration 0004 applied — test in Supabase test mode after merge.
- **Merged** as PR #45 (owner-merged 2026-08-06). Migration 0004 still needs to be run in the Supabase SQL editor before the new flows are exercised; then the test-mode acceptance pass.

### 2026-08-06 (Claude Code — docs: session workflow rules)

Documentation-only follow-up on a fresh branch off latest main (PR: `docs(workflow): session workflow rules`). No code changes.

- **CLAUDE.md:** added a "Workflow rules (2026-08-06)" subsection under "Automation and tooling preferences" with four owner rules — local sessions `git pull origin main` before any read/edit (never a stale main); cloud build sessions always branch fresh from `origin/main`; build sessions never schedule reminders or self-check-ins (PR monitoring is handled externally); migrations stay manual via the Supabase SQL editor and every migration-adding PR carries its full SQL in the description. Bumped "Last updated" to 2026-08-06.
- Recorded PR #45's merge in the Phase 3 entry above.

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
